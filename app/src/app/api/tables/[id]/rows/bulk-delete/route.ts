import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { tableForOrg, gate } from '@/lib/base-engine';
import { syncRowReverseLinks } from '@/lib/base-link-sync';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ ids: z.array(z.string()).min(1).max(500) }).strict();

// POST /api/tables/[id]/rows/bulk-delete — delete many rows at once (editor+).
// Mirrors each deleted row's link cells to clear the reverse side first.
export const POST = withRoute('rows.bulkDelete', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id: tableId } = await ctx.params;
  const t = await tableForOrg(tableId, r.orgId, r.session);
  if (!t) return jsonError('not_found', 404);
  const g = await gate(t.base, r.orgId, r.session, 'editor');
  if (g) return g;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const fields = await prisma.field.findMany({ where: { tableId }, select: { id: true, type: true, options: true } });
  const rows = await prisma.row.findMany({ where: { id: { in: parsed.data.ids }, tableId }, select: { id: true, data: true } });
  for (const row of rows) {
    await syncRowReverseLinks(fields, row.id, (row.data ?? {}) as Record<string, unknown>, {});
  }
  await prisma.row.deleteMany({ where: { id: { in: rows.map((row) => row.id) }, tableId } });
  return jsonOk({ deleted: rows.length });
});
