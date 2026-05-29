import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRoute } from '@/lib/with-route';
import type { QuizQuestion } from '@/lib/quiz';

// GET /api/quiz/[assignmentId] — the assigned user fetches their quiz.
// Correct answers are stripped unless the quiz is already completed (review mode).
async function getHandler(_req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { assignmentId } = await params;

  const a = await prisma.quizAssignment.findUnique({
    where: { id: assignmentId },
    include: { quiz: { include: { meeting: { select: { id: true, title: true } } } } },
  });
  if (!a) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (a.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const questions = (Array.isArray(a.quiz.questions) ? a.quiz.questions : []) as unknown as QuizQuestion[];
  const completed = a.status === 'completed';
  const safeQuestions = questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    type: q.type,
    options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
    ...(completed ? { correctOptionIds: q.correctOptionIds } : {}),
  }));

  return NextResponse.json({
    assignment: {
      id: a.id,
      status: a.status,
      score: a.score,
      maxScore: a.maxScore,
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      openBook: a.quiz.openBook,
      meetingId: a.quiz.meeting.id,
      meetingTitle: a.quiz.meeting.title,
      questions: safeQuestions,
      answers: completed ? (a.answers ?? {}) : undefined,
    },
  });
}

export const GET = withRoute('quiz.assignment.get', getHandler);
