import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRoute } from '@/lib/with-route';

// GET /api/quizzes/managed — quizzes the current user manages (admin: all;
// otherwise quizzes for meetings they created), with per-assignee summary.
async function getHandler(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isAdmin = session.user.role === 'admin';

  const quizzes = await prisma.quiz.findMany({
    where: {
      status: 'assigned',
      ...(isAdmin ? {} : { meeting: { createdById: session.user.id } }),
    },
    include: {
      meeting: { select: { id: true, title: true } },
      assignments: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { assignedAt: 'asc' },
      },
    },
    orderBy: { assignedAt: 'desc' },
    take: 40,
  });

  return NextResponse.json(
    quizzes.map((q) => ({
      quizId: q.id,
      meetingId: q.meeting.id,
      meetingTitle: q.meeting.title,
      openBook: q.openBook,
      assignedAt: q.assignedAt ? q.assignedAt.toISOString() : null,
      questionCount: Array.isArray(q.questions) ? (q.questions as unknown[]).length : 0,
      assignments: q.assignments.map((a) => ({
        id: a.id,
        user: a.user,
        status: a.status,
        score: a.score,
        maxScore: a.maxScore,
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      })),
    })),
  );
}

export const GET = withRoute('quizzes.managed', getHandler);
