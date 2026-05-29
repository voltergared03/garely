import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRoute } from '@/lib/with-route';
import type { QuizQuestion } from '@/lib/quiz';

// GET /api/quiz/[assignmentId]/review — admin or the meeting creator reviews a
// single assignee's answers (read-only; includes correct answers).
async function getHandler(_req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { assignmentId } = await params;

  const a = await prisma.quizAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      quiz: { include: { meeting: { select: { id: true, title: true, createdById: true } } } },
    },
  });
  if (!a) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const canReview = session.user.role === 'admin' || a.quiz.meeting.createdById === session.user.id;
  if (!canReview) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const questions = (Array.isArray(a.quiz.questions) ? a.quiz.questions : []) as unknown as QuizQuestion[];

  return NextResponse.json({
    user: a.user,
    status: a.status,
    score: a.score,
    maxScore: a.maxScore,
    completedAt: a.completedAt ? a.completedAt.toISOString() : null,
    meetingTitle: a.quiz.meeting.title,
    questions,
    answers: (a.answers as Record<string, string[]>) ?? {},
  });
}

export const GET = withRoute('quiz.assignment.review', getHandler);
