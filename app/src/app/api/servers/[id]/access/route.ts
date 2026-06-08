import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

async function adminServer(id: string, orgId: string) {
  return prisma.serverConnection.findFirst({ where: { id, orgId }, select: { id: true } });
}

// GET /api/servers/[id]/access — admin-only: list grants (resolved to user/department names).
export const GET = withRoute('servers.access.list', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  if (r.session.user.role !== 'admin') return jsonError('forbidden', 403);
  const { id } = await ctx.params;
  if (!(await adminServer(id, r.orgId))) return jsonError('not_found', 404);
  const grants = await prisma.serverAccess.findMany({
    where: { connectionId: id },
    orderBy: { createdAt: 'asc' },
  });
  const userIds = grants.map((g) => g.userId).filter((x): x is string => !!x);
  const deptIds = grants.map((g) => g.departmentId).filter((x): x is string => !!x);
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, image: true } })
    : [];
  const depts = deptIds.length
    ? await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true, color: true } })
    : [];
  const uMap = new Map(users.map((u) => [u.id, u]));
  const dMap = new Map(depts.map((d) => [d.id, d]));
  return NextResponse.json({
    grants: grants.map((g) => ({
      id: g.id,
      kind: g.userId ? 'user' : 'department',
      user: g.userId ? (uMap.get(g.userId) ?? null) : null,
      department: g.departmentId ? (dMap.get(g.departmentId) ?? null) : null,
      createdAt: g.createdAt,
    })),
  });
});

const postSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    departmentId: z.string().trim().min(1).optional(),
  })
  .refine((d) => !!d.userId !== !!d.departmentId, {
    message: 'exactly one of userId or departmentId',
  });

// POST /api/servers/[id]/access — admin-only: grant access to a user XOR a department.
export const POST = withRoute('servers.access.grant', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  if (r.session.user.role !== 'admin') return jsonError('forbidden', 403);
  const { id } = await ctx.params;
  if (!(await adminServer(id, r.orgId))) return jsonError('not_found', 404);
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const { userId, departmentId } = parsed.data;
  // Validate target belongs to this org.
  if (userId && !(await prisma.membership.count({ where: { orgId: r.orgId, userId } }))) {
    return jsonError('invalid_user', 400);
  }
  if (departmentId && !(await prisma.department.count({ where: { id: departmentId, orgId: r.orgId } }))) {
    return jsonError('invalid_department', 400);
  }
  const grant = await prisma.serverAccess.upsert({
    where: userId
      ? { connectionId_userId: { connectionId: id, userId } }
      : { connectionId_departmentId: { connectionId: id, departmentId: departmentId! } },
    create: {
      connectionId: id,
      userId: userId ?? null,
      departmentId: departmentId ?? null,
      grantedById: r.session.user.id,
    },
    update: {},
  });
  return NextResponse.json({ id: grant.id }, { status: 201 });
});

// DELETE /api/servers/[id]/access?grantId=... — admin-only: revoke a grant.
export const DELETE = withRoute('servers.access.revoke', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  if (r.session.user.role !== 'admin') return jsonError('forbidden', 403);
  const { id } = await ctx.params;
  if (!(await adminServer(id, r.orgId))) return jsonError('not_found', 404);
  const grantId = new URL(req.url).searchParams.get('grantId');
  if (!grantId) return jsonError('grantId required', 400);
  await prisma.serverAccess.deleteMany({ where: { id: grantId, connectionId: id } });
  return jsonOk();
});
