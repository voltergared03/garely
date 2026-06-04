import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { baseForOrg, basePermission } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string; userId: string }> };

const patchSchema = z
  .object({
    role: z.enum(['viewer', 'editor', 'admin']).optional(),
    hiddenFields: z.array(z.string()).optional(),
  })
  .strict();

// PATCH /api/bases/[id]/members/[userId] — change a member's role / hidden columns (admin).
export const PATCH = withRoute('base.members.update', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id, userId } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  if ((await basePermission(base, r.orgId, r.session)).level !== 'admin') return jsonError('forbidden', 403);
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const data: Prisma.BaseMemberUpdateManyMutationInput = {};
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.hiddenFields !== undefined) data.hiddenFields = parsed.data.hiddenFields as Prisma.InputJsonValue;
  const res = await prisma.baseMember.updateMany({ where: { baseId: id, userId }, data });
  if (res.count === 0) return jsonError('not_found', 404);
  return jsonOk();
});

// DELETE /api/bases/[id]/members/[userId] — revoke access (admin).
export const DELETE = withRoute('base.members.remove', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id, userId } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  if ((await basePermission(base, r.orgId, r.session)).level !== 'admin') return jsonError('forbidden', 403);
  await prisma.baseMember.deleteMany({ where: { baseId: id, userId } });
  return jsonOk();
});
