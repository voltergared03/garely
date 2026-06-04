import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { baseForOrg } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string; userId: string }> };

// DELETE /api/bases/[id]/members/[userId] — revoke a member's access.
export const DELETE = withRoute('base.members.remove', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id, userId } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  if (base.createdById !== r.session.user.id && r.session.user.role !== 'admin') {
    return jsonError('forbidden', 403);
  }
  await prisma.baseMember.deleteMany({ where: { baseId: id, userId } });
  return jsonOk();
});
