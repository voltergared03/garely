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

// PATCH /api/tables/[id]/rows/reorder — drag-to-reorder rows (editor+).
// Body: { order: rowId[] } in the new top→bottom order. Permutes the listed
// rows within the position-slots they occupy (pagination/filter-safe); rows not
// in the list keep their position. Manual order shows only when no sort is
// active (a view sort overrides position on read) — the client hides the handle
// in that case.
export const PATCH = withRoute('rows.reorder', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id: tableId } = await ctx.params;
  const t = await tableForOrg(tableId, r.orgId, r.session);
  if (!t) return jsonError('not_found', 404);
  const g = await gate(t.base, r.orgId, r.session, 'editor');
  if (g) return g;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const rows = await prisma.row.findMany({ where: { tableId }, select: { id: true, position: true } });
  const updates = computeReorder(rows, parsed.data.order);
  if (updates.length) {
    await prisma.$transaction(updates.map((u) => prisma.row.update({ where: { id: u.id }, data: { position: u.position } })));
  }
  return jsonOk();
});
