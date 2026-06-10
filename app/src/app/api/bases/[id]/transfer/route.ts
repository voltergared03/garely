import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { baseForOrg, canTransferBase } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ userId: z.string().min(1) }).strict();

// POST /api/bases/[id]/transfer { userId } — hand a base to another org member.
// Allowed only by the CURRENT owner or a workspace admin (a base-admin *member*
// can manage but not give away what they don't own). The previous owner is kept
// on as an `admin` member so they don't lose access; the new owner becomes the
// auto-admin owner. The recipient must be an org member.
export const POST = withRoute('bases.transfer', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  if (!canTransferBase(base, r.session)) return jsonError('forbidden', 403);
  // App-managed bases (the per-org Tasks table) have no transferable ownership.
  if (await prisma.table.count({ where: { baseId: id, system: true } })) return jsonError('forbidden', 403);

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const { userId } = parsed.data;
  if (userId === base.createdById) return jsonOk({ ownerId: userId }); // no-op

  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: r.orgId, userId } },
    select: { id: true },
  });
  if (!membership) return jsonError('not_in_workspace', 404);

  const prevOwner = base.createdById;
  await prisma.$transaction(async (tx) => {
    await tx.base.update({ where: { id }, data: { createdById: userId } });
    // Keep the outgoing owner with admin access (so a restricted base doesn't lock them out).
    if (prevOwner && prevOwner !== userId) {
      await tx.baseMember.upsert({
        where: { baseId_userId: { baseId: id, userId: prevOwner } },
        update: { role: 'admin' },
        create: { baseId: id, userId: prevOwner, role: 'admin' },
      });
    }
    // The new owner is now the auto-admin owner — drop any explicit member row for them.
    await tx.baseMember.deleteMany({ where: { baseId: id, userId } });
  });
  return jsonOk({ ownerId: userId });
});
