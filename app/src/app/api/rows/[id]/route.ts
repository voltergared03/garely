import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { rowForOrg, basePermission, atLeast, gate, stripHidden } from '@/lib/base-engine';
import { mergeRowData, presentRowData } from '@/lib/base-rows';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    data: z.record(z.string(), z.unknown()).optional(),
    position: z.number().int().optional(),
  })
  .strict();

// PATCH — partial cell update (editor+). Hidden fields can't be written.
export const PATCH = withRoute('rows.update', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);
  const perm = await basePermission(row.table.base, r.orgId, r.session);
  if (!atLeast(perm.level, 'editor')) return jsonError('forbidden', 403);
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const fields = await prisma.field.findMany({ where: { tableId: row.tableId }, select: { id: true, type: true, options: true } });
  const fieldsToSet: Prisma.RowUpdateInput = {};
  if (parsed.data.position !== undefined) fieldsToSet.position = parsed.data.position;
  if (parsed.data.data !== undefined) {
    const patch = stripHidden(parsed.data.data as Record<string, unknown>, perm.hiddenFields);
    fieldsToSet.data = mergeRowData(fields, (row.data ?? {}) as Record<string, unknown>, patch);
  }
  const updated = await prisma.row.update({ where: { id }, data: fieldsToSet });
  return NextResponse.json({ ...updated, data: presentRowData((updated.data ?? {}) as Record<string, unknown>, fields) });
});

// DELETE — editor+.
export const DELETE = withRoute('rows.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);
  const g = await gate(row.table.base, r.orgId, r.session, 'editor');
  if (g) return g;
  await prisma.row.delete({ where: { id } });
  return jsonOk();
});
