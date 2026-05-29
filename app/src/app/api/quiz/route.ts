import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRoute } from '@/lib/with-route';

// GET /api/quiz — the current user's quiz assignments (for the dashboard card).
async function getHandler(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await prisma.quizAssignment.findMany({
    where: { userId: session.user.id },
    include: { quiz: { include: { meeting: { select: { id: true, title: true } } } } },
    orderBy: [{ status: 'asc' }, { assignedAt: 'desc' }],
    take: 50,
  });

  return NextResponse.json(
    rows.map((a) => ({
      id: a.id,
      status: a.status,
      score: a.score,
      maxScore: a.maxScore,
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      assignedAt: a.assignedAt.toISOString(),
      meetingId: a.quiz.meeting.id,
      meetingTitle: a.quiz.meeting.title,
      questionCount: Array.isArray(a.quiz.questions) ? (a.quiz.questions as unknown[]).length : 0,
    })),
  );
}

export const GET = withRoute('quiz.mine', getHandler);
