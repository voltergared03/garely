import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRoute } from '@/lib/with-route';
import { notify } from '@/lib/notify';

// admin or meeting creator only
async function requireOwner(
  meetingId: string,
  userId: string,
  role: string | null | undefined,
): Promise<NextResponse | null> {
  if (role === 'admin') return null;
  const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { createdById: true } });
  if (!m || m.createdById !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

const assignSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(200) });

// POST /api/meetings/[id]/quiz/assign — assign the (draft) quiz to selected
// registered participants of this meeting. Idempotent: users already assigned
// are skipped. Admin/creator only.
async function postHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const forbidden = await requireOwner(id, session.user.id, session.user.role);
  if (forbidden) return forbidden;

  const v = assignSchema.safeParse(await req.json().catch(() => ({})));
  if (!v.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const quiz = await prisma.quiz.findUnique({ where: { meetingId: id }, select: { id: true, questions: true } });
  if (!quiz) return NextResponse.json({ error: 'quiz_not_found' }, { status: 404 });
  const questionCount = Array.isArray(quiz.questions) ? (quiz.questions as unknown[]).length : 0;
  if (questionCount === 0) return NextResponse.json({ error: 'no_questions' }, { status: 400 });

  // Only registered participants of THIS meeting may be assigned.
  const parts = await prisma.meetingParticipant.findMany({
    where: { meetingId: id, userId: { in: v.data.userIds } },
    select: { userId: true },
  });
  const eligible = new Set(parts.map((p) => p.userId).filter((x): x is string => !!x));
  const targets = [...new Set(v.data.userIds.filter((u) => eligible.has(u)))];
  if (targets.length === 0) return NextResponse.json({ error: 'no_eligible_users' }, { status: 400 });

  // Skip users already assigned (idempotent).
  const already = await prisma.quizAssignment.findMany({
    where: { quizId: quiz.id, userId: { in: targets } },
    select: { userId: true },
  });
  const alreadySet = new Set(already.map((a) => a.userId));
  const newIds = targets.filter((u) => !alreadySet.has(u));

  const created: { id: string; userId: string }[] = [];
  for (const uid of newIds) {
    const a = await prisma.quizAssignment.create({
      data: { quizId: quiz.id, userId: uid, assignedById: session.user.id, status: 'pending', maxScore: questionCount },
      select: { id: true, userId: true },
    });
    created.push(a);
  }

  await prisma.quiz.update({ where: { id: quiz.id }, data: { status: 'assigned', assignedAt: new Date() } });

  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { title: true } });
  for (const a of created) {
    await notify({
      userIds: [a.userId],
      type: 'quiz_assigned',
      titleKey: 'quizAssignedTitle',
      bodyKey: 'quizAssignedBody',
      values: { title: meeting?.title || '' },
      link: `/quiz/${a.id}`,
      meetingId: id,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, assigned: created.length, alreadyAssigned: alreadySet.size });
}

export const POST = withRoute('meetings.quiz.assign', postHandler);
