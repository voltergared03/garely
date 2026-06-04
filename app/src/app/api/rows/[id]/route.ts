import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { rowForOrg } from '@/lib/base-engine';
import { mergeRowData } from '@/lib/base-rows';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    data: z.record(z.string(), z.unknown()).optional(),
    position: z.number().int().optional(),
  })
  .strict();

// PATCH /api/rows/[id] — partial cell update (merge). A key whose value clears
// (empty) removes that cell. `data` is validated per field type.
export const PATCH = withRoute('rows.update', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const fieldsToSet: Prisma.RowUpdateInput = {};
  if (parsed.data.position !== undefined) fieldsToSet.position = parsed.data.position;
  if (parsed.data.data !== undefined) {
    const fields = await prisma.field.findMany({
      where: { tableId: row.tableId },
      select: { id: true, type: true, options: true },
    });
    fieldsToSet.data = mergeRowData(
      fields,
      (row.data ?? {}) as Record<string, unknown>,
      parsed.data.data,
    );
  }
  const updated = await prisma.row.update({ where: { id }, data: fieldsToSet });
  return NextResponse.json(updated);
});

// DELETE /api/rows/[id]
export const DELETE = withRoute('rows.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  if (!(await rowForOrg(id, r.orgId, r.session))) return jsonError('not_found', 404);
  await prisma.row.delete({ where: { id } });
  return jsonOk();
});
