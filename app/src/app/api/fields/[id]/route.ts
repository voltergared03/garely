import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { fieldForOrg, gateTable, fieldTypeSchema, normalizeFieldOptions } from '@/lib/base-engine';
import { ensureReverseLink, unpairReverseLink } from '@/lib/base-link-sync';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    type: fieldTypeSchema.optional(),
    options: z.unknown().optional(),
    position: z.number().int().optional(),
    width: z.number().int().min(60).max(800).nullable().optional(),
  })
  .strict();

// PATCH /api/fields/[id] — rename / change type / options / reorder (editor+).
export const PATCH = withRoute('fields.update', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const field = await fieldForOrg(id, r.orgId, r.session);
  if (!field) return jsonError('not_found', 404);
  const g = await gateTable(field.table, field.table.base, r.orgId, r.session, 'editor');
  if (g) return g;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const nextType = parsed.data.type ?? (field.type as z.infer<typeof fieldTypeSchema>);
  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.position !== undefined) data.position = parsed.data.position;
  if (parsed.data.width !== undefined) data.width = parsed.data.width;
  if (parsed.data.options !== undefined || parsed.data.type !== undefined) {
    let raw = parsed.data.options ?? field.options;
    // Keep the two-way pairing: client option edits don't carry reverseFieldId.
    if (nextType === 'link' && raw && typeof raw === 'object') {
      const existingReverse = (field.options as { reverseFieldId?: string } | null)?.reverseFieldId;
      if (existingReverse && !(raw as { reverseFieldId?: string }).reverseFieldId) raw = { ...(raw as object), reverseFieldId: existingReverse };
    }
    const opts = normalizeFieldOptions(nextType, raw);
    if (opts !== undefined) data.options = opts;
  }
  let updated = await prisma.field.update({ where: { id }, data });
  // Changing a field TO link (or setting its target later) should pair it two-way,
  // same as creating a link field — adopt a reciprocal field or create the reverse.
  if (updated.type === 'link' && !(updated.options as { reverseFieldId?: string } | null)?.reverseFieldId) {
    const src = await prisma.table.findUnique({ where: { id: updated.tableId }, select: { name: true, primaryFieldId: true } });
    if (src) {
      await ensureReverseLink({ id: updated.id, tableId: updated.tableId, options: updated.options }, src);
      const refreshed = await prisma.field.findUnique({ where: { id: updated.id } });
      if (refreshed) updated = refreshed;
    }
  }
  return NextResponse.json(updated);
});

// DELETE /api/fields/[id] — remove a column (editor+). Repoints primary if needed.
export const DELETE = withRoute('fields.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const field = await fieldForOrg(id, r.orgId, r.session);
  if (!field) return jsonError('not_found', 404);
  const g = await gateTable(field.table, field.table.base, r.orgId, r.session, 'editor');
  if (g) return g;

  await unpairReverseLink({ id: field.id, type: field.type, options: field.options });
  await prisma.$transaction(async (tx) => {
    if (field.table.primaryFieldId === id) {
      const next = await tx.field.findFirst({
        where: { tableId: field.table.id, id: { not: id } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      await tx.table.update({ where: { id: field.table.id }, data: { primaryFieldId: next?.id ?? null } });
    }
    await tx.field.delete({ where: { id } });
  });
  return jsonOk();
});
