import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { fieldForOrg, gate, fieldTypeSchema, normalizeFieldOptions } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    type: fieldTypeSchema.optional(),
    options: z.unknown().optional(),
    position: z.number().int().optional(),
  })
  .strict();

// PATCH /api/fields/[id] — rename / change type / options / reorder (editor+).
export const PATCH = withRoute('fields.update', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const field = await fieldForOrg(id, r.orgId, r.session);
  if (!field) return jsonError('not_found', 404);
  const g = await gate(field.table.base, r.orgId, r.session, 'editor');
  if (g) return g;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const nextType = parsed.data.type ?? (field.type as z.infer<typeof fieldTypeSchema>);
  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.type !== undefined) data.type = parsed.data.type;
  if (parsed.data.position !== undefined) data.position = parsed.data.position;
  if (parsed.data.options !== undefined || parsed.data.type !== undefined) {
    const opts = normalizeFieldOptions(nextType, parsed.data.options ?? field.options);
    if (opts !== undefined) data.options = opts;
  }
  const updated = await prisma.field.update({ where: { id }, data });
  return NextResponse.json(updated);
});

// DELETE /api/fields/[id] — remove a column (editor+). Repoints primary if needed.
export const DELETE = withRoute('fields.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const field = await fieldForOrg(id, r.orgId, r.session);
  if (!field) return jsonError('not_found', 404);
  const g = await gate(field.table.base, r.orgId, r.session, 'editor');
  if (g) return g;

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
