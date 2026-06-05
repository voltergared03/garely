import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { rowForOrg, basePermission, atLeast } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string; commentId: string }> };

// DELETE /api/rows/[id]/comments/[commentId] — remove a comment (author or base-admin).
export const DELETE = withRoute('rowComments.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id, commentId } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);
  const c = await prisma.rowComment.findUnique({ where: { id: commentId } });
  if (!c || c.rowId !== id) return jsonError('not_found', 404);
  const perm = await basePermission(row.table.base, r.orgId, r.session);
  if (!atLeast(perm.level, 'admin') && c.userId !== r.session.user.id) return jsonError('forbidden', 403);
  await prisma.rowComment.delete({ where: { id: commentId } });
  return jsonOk();
});
