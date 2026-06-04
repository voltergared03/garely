import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { viewForOrg } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    type: z.enum(['grid', 'kanban', 'calendar']).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    position: z.number().int().optional(),
  })
  .strict();

// PATCH /api/views/[id] — rename, change type, update config (filters/sorts/
// visible fields / kanban stack field / calendar date field), reorder.
export const PATCH = withRoute('views.update', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  if (!(await viewForOrg(id, r.orgId))) return jsonError('not_found', 404);
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const fieldsToSet: Prisma.ViewUpdateInput = {};
  if (parsed.data.name !== undefined) fieldsToSet.name = parsed.data.name;
  if (parsed.data.type !== undefined) fieldsToSet.type = parsed.data.type;
  if (parsed.data.position !== undefined) fieldsToSet.position = parsed.data.position;
  if (parsed.data.config !== undefined) fieldsToSet.config = parsed.data.config as Prisma.InputJsonValue;
  const view = await prisma.view.update({ where: { id }, data: fieldsToSet });
  return NextResponse.json(view);
});

// DELETE /api/views/[id] — a table must keep at least one view.
export const DELETE = withRoute('views.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const view = await viewForOrg(id, r.orgId);
  if (!view) return jsonError('not_found', 404);
  const count = await prisma.view.count({ where: { tableId: view.table.id } });
  if (count <= 1) return jsonError('last_view', 400);
  await prisma.view.delete({ where: { id } });
  return jsonOk();
});
