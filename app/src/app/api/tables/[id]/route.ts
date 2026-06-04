import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { tableForOrg, gate, basePermission } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };

// GET — table + fields + views. Per-member hidden fields are stripped.
export const GET = withRoute('tables.get', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const t = await tableForOrg(id, r.orgId, r.session);
  if (!t) return jsonError('not_found', 404);
  const perm = await basePermission(t.base, r.orgId, r.session);
  const [fields, views] = await Promise.all([
    prisma.field.findMany({ where: { tableId: id }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
    prisma.view.findMany({ where: { tableId: id }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  const visibleFields = perm.hiddenFields.length ? fields.filter((f) => !perm.hiddenFields.includes(f.id)) : fields;
  return NextResponse.json({ id: t.id, baseId: t.baseId, name: t.name, icon: t.icon, primaryFieldId: t.primaryFieldId, fields: visibleFields, views });
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    icon: z.string().trim().max(40).nullish(),
    primaryFieldId: z.string().nullish(),
    position: z.number().int().optional(),
  })
  .strict();

// PATCH — rename / set primary / reorder: editor+.
export const PATCH = withRoute('tables.update', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const t = await tableForOrg(id, r.orgId, r.session);
  if (!t) return jsonError('not_found', 404);
  const g = await gate(t.base, r.orgId, r.session, 'editor');
  if (g) return g;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  if (parsed.data.primaryFieldId) {
    const f = await prisma.field.findUnique({ where: { id: parsed.data.primaryFieldId }, select: { tableId: true } });
    if (!f || f.tableId !== id) return jsonError('invalid_primary_field', 400);
  }
  const table = await prisma.table.update({ where: { id }, data: parsed.data });
  return NextResponse.json(table);
});

// DELETE — admin only (cascades fields/rows/views).
export const DELETE = withRoute('tables.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const t = await tableForOrg(id, r.orgId, r.session);
  if (!t) return jsonError('not_found', 404);
  const g = await gate(t.base, r.orgId, r.session, 'admin');
  if (g) return g;
  await prisma.table.delete({ where: { id } });
  return jsonOk();
});
