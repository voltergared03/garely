import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { tableForOrg, gate } from '@/lib/base-engine';
import { presentRowData } from '@/lib/base-rows';
import { enrichLinks } from '@/lib/base-links';
import { syncRowReverseLinks } from '@/lib/base-link-sync';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ ids: z.array(z.string()).min(1).max(100) }).strict();

// POST /api/tables/[id]/rows/duplicate — clone rows (editor+). Copies cell data
// verbatim and inserts the copies right after the last source row (preserving
// source order). Link cells are copied and their reverse side is mirrored.
export const POST = withRoute('rows.duplicate', async (req: NextRequest, ctx: Ctx) => {
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
  const sources = await prisma.row.findMany({
    where: { id: { in: parsed.data.ids }, tableId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  if (!sources.length) return jsonError('not_found', 404);

  const insertAt = Math.max(...sources.map((s) => s.position)) + 1;
  const created = await prisma.$transaction(async (tx) => {
    await tx.row.updateMany({ where: { tableId, position: { gte: insertAt } }, data: { position: { increment: sources.length } } });
    const out = [];
    for (let i = 0; i < sources.length; i++) {
      out.push(await tx.row.create({
        data: { tableId, data: (sources[i].data ?? {}) as Prisma.InputJsonValue, createdById: r.session.user.id, position: insertAt + i },
      }));
    }
    return out;
  });

  for (const row of created) {
    await syncRowReverseLinks(fields, row.id, {}, (row.data ?? {}) as Record<string, unknown>);
  }
  const presented = created.map((row) => ({ ...row, data: presentRowData((row.data ?? {}) as Record<string, unknown>, fields) }));
  const rows = await enrichLinks(presented, fields, r.orgId, r.session);
  return NextResponse.json({ rows }, { status: 201 });
});
