import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

const addSchema = z.object({
  userId: z.string().trim().min(1),
  isLead: z.boolean().optional(),
});

// POST /api/departments/[id]/members — admin adds a member (or toggles lead).
// Idempotent: upserts the membership.
export const POST = withRoute('departments.member.add', async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAdmin();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const parsed = addSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const { userId, isLead } = parsed.data;

  const member = await prisma.departmentMember.upsert({
    where: { departmentId_userId: { departmentId: id, userId } },
    create: { departmentId: id, userId, isLead: !!isLead },
    update: isLead === undefined ? {} : { isLead },
  });
  return NextResponse.json(member);
});

// DELETE /api/departments/[id]/members?userId=... — admin removes a member.
export const DELETE = withRoute('departments.member.remove', async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAdmin();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const userId = new URL(req.url).searchParams.get('userId') || '';
  if (!userId) return jsonError('invalid_body', 400);

  await prisma.departmentMember.deleteMany({ where: { departmentId: id, userId } });
  return NextResponse.json({ ok: true });
});
