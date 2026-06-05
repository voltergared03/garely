/**
 * Two-way (bidirectional) link sync for the base engine.
 *
 * A link field can be PAIRED with a reverse link field in the target table via
 * `options.reverseFieldId`. When a row's link cell changes, we mirror the diff
 * onto the paired field of the affected target rows — writing those rows
 * DIRECTLY (never through the API/mirror path), so there's no recursion.
 *
 * Pairing is created when a link field is added (auto-create or adopt an
 * existing reciprocal field) and preserved through edits. NODE-ONLY (prisma).
 */
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

type FieldLite = { id: string; tableId?: string; type: string; options: unknown };

/** Pull the array of target row-ids from a coerced link cell. */
export function linkIds(cell: unknown): string[] {
  return Array.isArray(cell) ? cell.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

/** Next value of a reverse cell after adding/removing one source row-id. */
export function reverseCellNext(current: unknown, sourceRowId: string, op: 'add' | 'remove', multiple: boolean): string[] {
  const arr = Array.isArray(current) ? current.filter((x): x is string => typeof x === 'string') : [];
  if (op === 'remove') return arr.filter((x) => x !== sourceRowId);
  if (!multiple) return [sourceRowId]; // single-value reverse holds exactly one
  return arr.includes(sourceRowId) ? arr : [...arr, sourceRowId].slice(0, 50);
}

/** Mirror one link field's change onto its paired reverse field's target rows. */
async function syncReverseLinks(field: FieldLite, sourceRowId: string, oldIds: string[], newIds: string[]): Promise<void> {
  const opts = (field.options ?? {}) as { reverseFieldId?: string; targetTableId?: string };
  if (field.type !== 'link' || !opts.reverseFieldId || !opts.targetTableId) return;
  const added = newIds.filter((id) => !oldIds.includes(id));
  const removed = oldIds.filter((id) => !newIds.includes(id));
  if (!added.length && !removed.length) return;

  const reverseField = await prisma.field.findUnique({ where: { id: opts.reverseFieldId }, select: { id: true, type: true, options: true } });
  if (!reverseField || reverseField.type !== 'link') return;
  const reverseMultiple = !!(reverseField.options as { multiple?: boolean } | null)?.multiple;

  const affected = [...new Set([...added, ...removed])];
  const rows = await prisma.row.findMany({ where: { id: { in: affected }, tableId: opts.targetTableId }, select: { id: true, data: true } });
  await Promise.all(
    rows.map((row) => {
      const data = { ...((row.data ?? {}) as Record<string, unknown>) };
      const op = added.includes(row.id) ? 'add' : 'remove';
      const next = reverseCellNext(data[reverseField.id], sourceRowId, op, reverseMultiple);
      if (next.length) data[reverseField.id] = next;
      else delete data[reverseField.id];
      return prisma.row.update({ where: { id: row.id }, data: { data: data as Prisma.InputJsonValue } });
    }),
  );
}

/** Mirror EVERY paired link field on a row given its old/new full data. Best-effort. */
export async function syncRowReverseLinks(
  fields: FieldLite[],
  rowId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
): Promise<void> {
  for (const f of fields) {
    if (f.type !== 'link' || !(f.options as { reverseFieldId?: string } | null)?.reverseFieldId) continue;
    try {
      await syncReverseLinks(f, rowId, linkIds(oldData[f.id]), linkIds(newData[f.id]));
    } catch (e) {
      console.error('[base-link-sync] reverse sync failed for field', f.id, e);
    }
  }
}

/**
 * Ensure a link field is paired with a reverse field in its target table:
 * adopt an existing UNPAIRED reciprocal link field if present, else create one.
 * Sets `options.reverseFieldId` on both. Returns the reverse field id (or null).
 */
export async function ensureReverseLink(
  linkField: { id: string; tableId: string; options: unknown },
  sourceTable: { name: string; primaryFieldId: string | null },
): Promise<string | null> {
  const opts = (linkField.options ?? {}) as { targetTableId?: string; reverseFieldId?: string };
  if (opts.reverseFieldId) return opts.reverseFieldId;
  const targetTableId = opts.targetTableId;
  if (!targetTableId || targetTableId === linkField.tableId) return null;

  // Two-way links stay WITHIN one base (same permission scope). A cross-base
  // link is left one-directional — no auto reverse field, no mirror writes.
  const [srcTbl, tgtTbl] = await Promise.all([
    prisma.table.findUnique({ where: { id: linkField.tableId }, select: { baseId: true } }),
    prisma.table.findUnique({ where: { id: targetTableId }, select: { baseId: true } }),
  ]);
  if (!srcTbl || !tgtTbl || srcTbl.baseId !== tgtTbl.baseId) return null;

  const targetLinks = await prisma.field.findMany({ where: { tableId: targetTableId, type: 'link' } });
  const partner = targetLinks.find(
    (c) => c.id !== linkField.id && (c.options as { targetTableId?: string; reverseFieldId?: string } | null)?.targetTableId === linkField.tableId && !(c.options as { reverseFieldId?: string } | null)?.reverseFieldId,
  );

  if (partner) {
    await prisma.$transaction([
      prisma.field.update({ where: { id: linkField.id }, data: { options: { ...opts, reverseFieldId: partner.id } as Prisma.InputJsonValue } }),
      prisma.field.update({ where: { id: partner.id }, data: { options: { ...((partner.options ?? {}) as object), reverseFieldId: linkField.id } as Prisma.InputJsonValue } }),
    ]);
    return partner.id;
  }

  const count = await prisma.field.count({ where: { tableId: targetTableId } });
  const reverse = await prisma.field.create({
    data: {
      tableId: targetTableId,
      name: sourceTable.name,
      type: 'link',
      position: count,
      options: {
        targetTableId: linkField.tableId,
        multiple: true,
        ...(sourceTable.primaryFieldId ? { displayFieldId: sourceTable.primaryFieldId } : {}),
        reverseFieldId: linkField.id,
      } as Prisma.InputJsonValue,
    },
  });
  await prisma.field.update({ where: { id: linkField.id }, data: { options: { ...opts, reverseFieldId: reverse.id } as Prisma.InputJsonValue } });
  return reverse.id;
}

/** When a link field is removed, unpair its reverse (so it stops mirroring). */
export async function unpairReverseLink(field: { id: string; type: string; options: unknown }): Promise<void> {
  if (field.type !== 'link') return;
  const reverseFieldId = (field.options as { reverseFieldId?: string } | null)?.reverseFieldId;
  if (!reverseFieldId) return;
  const rev = await prisma.field.findUnique({ where: { id: reverseFieldId }, select: { options: true } });
  if (!rev) return;
  const { reverseFieldId: _drop, ...rest } = (rev.options ?? {}) as Record<string, unknown>;
  await prisma.field.update({ where: { id: reverseFieldId }, data: { options: rest as Prisma.InputJsonValue } });
}
