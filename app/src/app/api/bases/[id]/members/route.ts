import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { baseForOrg } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };
const userSel = { id: true, name: true, image: true, email: true };

// Only the base owner or an admin may manage sharing.
const canManage = (base: { createdById: string | null }, session: { user: { id: string; role: string } }) =>
  base.createdById === session.user.id || session.user.role === 'admin';

// GET /api/bases/[id]/members — sharing state (visibility + owner + members).
export const GET = withRoute('base.members.list', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  const members = await prisma.baseMember.findMany({
    where: { baseId: id },
    include: { user: { select: userSel } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({
    visibility: base.visibility,
    ownerId: base.createdById,
    canManage: canManage(base, r.session),
    members: members.map((m) => m.user),
  });
});

const addSchema = z.object({ email: z.string().trim().min(1) });

// POST /api/bases/[id]/members { email } — grant access to an existing org member.
// Does NOT create accounts: an email that isn't a member of this org → 404.
export const POST = withRoute('base.members.add', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  if (!canManage(base, r.session)) return jsonError('forbidden', 403);
  const parsed = addSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const email = parsed.data.email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email }, select: userSel });
  if (!user) return jsonError('not_in_workspace', 404);
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: r.orgId, userId: user.id } },
    select: { id: true },
  });
  if (!membership) return jsonError('not_in_workspace', 404);

  await prisma.baseMember.upsert({
    where: { baseId_userId: { baseId: id, userId: user.id } },
    update: {},
    create: { baseId: id, userId: user.id },
  });
  return NextResponse.json(user, { status: 201 });
});
