/**
 * `link` (relation) field support. A link cell stores an array of TARGET ROW ids
 * (in another table, possibly another base). On read we resolve those ids into
 * `[{ id, label }]` using the target table's display field — batched per link
 * field, and access-checked: if the viewer can't reach the target base, labels
 * come back empty (ids only). NODE-ONLY (prisma).
 */
import type { Session } from 'next-auth';
import { prisma } from './prisma';
import { tableForOrg } from './base-engine';
import type { FieldLike, RowData } from './base-rows';

export type LinkRef = { id: string; label: string };

type DisplayField = { id: string; type: string; options: unknown } | null;

/** Best-effort one-line label for a target row's display-field value. */
function cellToLabel(value: unknown, field: DisplayField): string {
  if (value == null || value === '') return '';
  const opts = (field?.options ?? {}) as { choices?: { id: string; name: string }[] };
  if (typeof value === 'string') {
    if (field?.type === 'singleSelect') return opts.choices?.find((c) => c.id === value)?.name ?? '';
    if (field?.type === 'date') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
    }
    return value;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '✓' : '';
  if (Array.isArray(value)) {
    if (field?.type === 'multiSelect') {
      return value.map((id) => opts.choices?.find((c) => c.id === id)?.name).filter(Boolean).join(', ');
    }
    return value.filter((v) => typeof v === 'string').join(', ');
  }
  return '';
}

/**
 * Resolve every `link` cell in `rows` to `[{id,label}]`. Returns a new array;
 * input rows are not mutated. Safe to call when there are no link fields (no-op).
 */
export async function enrichLinks<T extends { data: RowData }>(
  rows: T[],
  fields: FieldLike[],
  orgId: string,
  session: Session,
): Promise<T[]> {
  const linkFields = fields.filter((f) => f.type === 'link');
  if (linkFields.length === 0 || rows.length === 0) return rows;

  const fieldMaps = new Map<string, Map<string, string>>(); // fieldId → (targetRowId → label)
  for (const lf of linkFields) {
    const opts = (lf.options ?? {}) as { targetTableId?: string; displayFieldId?: string };
    const map = new Map<string, string>();
    fieldMaps.set(lf.id, map);
    const targetTableId = typeof opts.targetTableId === 'string' ? opts.targetTableId : '';
    if (!targetTableId) continue;

    const ids = new Set<string>();
    for (const row of rows) {
      const cell = row.data?.[lf.id];
      if (Array.isArray(cell)) for (const v of cell) if (typeof v === 'string') ids.add(v);
    }
    if (ids.size === 0) continue;

    const target = await tableForOrg(targetTableId, orgId, session); // access gate
    if (!target) continue; // no access → labels stay empty

    const displayFieldId = opts.displayFieldId || target.primaryFieldId || null;
    const displayField: DisplayField = displayFieldId
      ? await prisma.field.findUnique({ where: { id: displayFieldId }, select: { id: true, type: true, options: true } })
      : null;
    const targetRows = await prisma.row.findMany({
      where: { id: { in: [...ids] }, tableId: targetTableId },
      select: { id: true, data: true },
    });
    for (const tr of targetRows) {
      const v = displayField ? (tr.data as RowData | null)?.[displayField.id] : null;
      map.set(tr.id, cellToLabel(v, displayField));
    }
  }

  return rows.map((row) => {
    const data: RowData = { ...row.data };
    for (const lf of linkFields) {
      const cell = data[lf.id];
      if (!Array.isArray(cell)) continue;
      const map = fieldMaps.get(lf.id);
      data[lf.id] = (cell as unknown[])
        .filter((v): v is string => typeof v === 'string')
        .map((id) => ({ id, label: map?.get(id) ?? '' }));
    }
    return { ...row, data };
  });
}
