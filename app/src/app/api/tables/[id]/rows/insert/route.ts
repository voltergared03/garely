import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { tableForOrg, gate } from '@/lib/base-engine';
import { presentRowData } from '@/lib/base-rows';
import { enrichLinks } from '@/lib/base-links';

type Ctx = { params: Promise<{ id: string }> };

const schema = z
  .object({
    anchorId: z.string().optional(),
    position: z.enum(['above', 'below']).default('below'),
    count: z.number().int().min(1).max(50).default(1),
  })
  .strict();

// POST /api/tables/[id]/rows/insert — create N empty rows above/below an anchor
// row (editor+). Existing rows at/after the insert point shift down atomically.
export const POST = withRoute('rows.insert', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id: tableId } = await ctx.params;
  const t = await tableForOrg(tableId, r.orgId, r.session);
  if (!t) return jsonError('not_found', 404);
  const g = await gate(t.base, r.orgId, r.session, 'editor');
  if (g) return g;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const { anchorId, position, count } = parsed.data;

  const fields = await prisma.field.findMany({ where: { tableId }, select: { id: true, type: true, options: true } });

  let startPos: number;
  if (anchorId) {
    const anchor = await prisma.row.findFirst({ where: { id: anchorId, tableId }, select: { position: true } });
    if (!anchor) return jsonError('not_found', 404);
    startPos = position === 'above' ? anchor.position : anchor.position + 1;
  } else {
    startPos = await prisma.row.count({ where: { tableId } }); // append at the end
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.row.updateMany({ where: { tableId, position: { gte: startPos } }, data: { position: { increment: count } } });
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(await tx.row.create({ data: { tableId, data: {}, createdById: r.session.user.id, position: startPos + i } }));
    }
    return out;
  });

  const presented = created.map((row) => ({ ...row, data: presentRowData((row.data ?? {}) as Record<string, unknown>, fields) }));
  const rows = await enrichLinks(presented, fields, r.orgId, r.session);
  return NextResponse.json({ rows }, { status: 201 });
});
