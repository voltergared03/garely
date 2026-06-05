import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { tableForOrg, gate } from '@/lib/base-engine';
import { computeReorder } from '@/lib/base-reorder';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ order: z.array(z.string()).min(1).max(5000) }).strict();

// PATCH /api/tables/[id]/fields/reorder — drag-to-reorder columns (editor+).
// Body: { order: fieldId[] } in the new left→right order. Permutes the listed
// fields within the position-slots they occupy; unlisted fields stay put.
export const PATCH = withRoute('fields.reorder', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id: tableId } = await ctx.params;
  const t = await tableForOrg(tableId, r.orgId, r.session);
  if (!t) return jsonError('not_found', 404);
  const g = await gate(t.base, r.orgId, r.session, 'editor');
  if (g) return g;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const fields = await prisma.field.findMany({ where: { tableId }, select: { id: true, position: true } });
  const updates = computeReorder(fields, parsed.data.order);
  if (updates.length) {
    await prisma.$transaction(updates.map((u) => prisma.field.update({ where: { id: u.id }, data: { position: u.position } })));
  }
  return jsonOk();
});
