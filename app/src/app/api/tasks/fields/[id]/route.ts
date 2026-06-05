import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { fieldTypeSchema } from '@/lib/base-engine';
import { updateTaskField, deleteTaskField } from '@/lib/tasks';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    type: fieldTypeSchema.optional(),
    options: z.unknown().optional(),
    position: z.number().int().optional(),
    width: z.number().int().min(60).max(800).nullable().optional(),
  })
  .strict();

// PATCH /api/tasks/fields/[id] — edit a CUSTOM task field (admin). The adapter
// refuses the 6 system field ids and any field outside the org's Tasks table.
export const PATCH = withRoute('tasks.fields.update', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  if (r.session.user.role !== 'admin') return jsonError('forbidden', 403);
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const result = await updateTaskField(r.orgId, id, parsed.data);
  if ('error' in result) return jsonError(result.error, result.status);
  return NextResponse.json(result.field);
});

// DELETE /api/tasks/fields/[id] — drop a CUSTOM task field (admin).
export const DELETE = withRoute('tasks.fields.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  if (r.session.user.role !== 'admin') return jsonError('forbidden', 403);
  const { id } = await ctx.params;
  const result = await deleteTaskField(r.orgId, id);
  if ('error' in result) return jsonError(result.error, result.status);
  return jsonOk();
});
