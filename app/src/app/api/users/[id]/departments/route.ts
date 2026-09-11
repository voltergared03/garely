import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { departmentsOfUser } from '@/lib/departments';

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ departmentIds: z.array(z.string().trim().min(1)).max(100) });

// PUT /api/users/[id]/departments — admin sets the FULL list of a user's departments.
//
// A person can belong to several departments (DepartmentMember is many-to-many), but
// until now the only way to say so was to open each department in turn and add them
// there; the Users list showed no departments at all, so it read as "one at most".
// This is the per-user side of the same membership table: set semantics, in one
// transaction — memberships not in the list go, missing ones are created, an existing
// one keeps its lead flag.
export const PUT = withRoute('users.departments.set', async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAdmin();
  if (session instanceof Response) return session;
  const { id: userId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const wanted = [...new Set(parsed.data.departmentIds)];

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return jsonError('not_found', 404);
  // Only departments that exist: an unknown id is a client bug, not a membership.
  const known = wanted.length
    ? await prisma.department.findMany({ where: { id: { in: wanted } }, select: { id: true } })
    : [];
  if (known.length !== wanted.length) return jsonError('unknown_department', 400);

  await prisma.$transaction(async (tx) => {
    await tx.departmentMember.deleteMany({ where: { userId, departmentId: { notIn: wanted } } });
    if (wanted.length) {
      await tx.departmentMember.createMany({
        data: wanted.map((departmentId) => ({ departmentId, userId })),
        skipDuplicates: true, // keeps an existing membership (and its lead flag) untouched
      });
    }
  });

  return NextResponse.json({ departments: await departmentsOfUser(userId) });
});
