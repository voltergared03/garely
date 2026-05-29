import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRoute } from '@/lib/with-route';
import { notify } from '@/lib/notify';
import { gradeQuiz, type QuizQuestion } from '@/lib/quiz';

const submitSchema = z.object({ answers: z.record(z.string(), z.array(z.string())) });

// POST /api/quiz/[assignmentId]/submit — the assigned user submits answers.
// Graded on the server; one attempt only.
async function postHandler(req: NextRequest, { params }: { params: Promise<{ assignmentId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { assignmentId } = await params;

  const v = submitSchema.safeParse(await req.json().catch(() => ({})));
  if (!v.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const a = await prisma.quizAssignment.findUnique({
    where: { id: assignmentId },
    include: { quiz: { include: { meeting: { select: { id: true, title: true } } } } },
  });
  if (!a) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (a.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (a.status === 'completed') return NextResponse.json({ error: 'already_completed' }, { status: 409 });

  const questions = (Array.isArray(a.quiz.questions) ? a.quiz.questions : []) as unknown as QuizQuestion[];
  const { score, maxScore } = gradeQuiz(questions, v.data.answers);

  await prisma.quizAssignment.update({
    where: { id: a.id },
    data: {
      status: 'completed',
      score,
      maxScore,
      answers: v.data.answers as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });

  // Tell the quiz creator that this user finished.
  if (a.quiz.createdById) {
    await notify({
      userIds: [a.quiz.createdById],
      type: 'quiz_completed',
      titleKey: 'quizCompletedTitle',
      bodyKey: 'quizCompletedBody',
      values: { name: session.user.name || '', score, max: maxScore, title: a.quiz.meeting.title },
      link: `/meetings/${a.quiz.meeting.id}/report`,
      meetingId: a.quiz.meeting.id,
    }).catch(() => {});
  }

  // Per-question correctness for immediate feedback.
  const correctOptionIds: Record<string, string[]> = {};
  for (const q of questions) correctOptionIds[q.id] = q.correctOptionIds;

  return NextResponse.json({ ok: true, score, maxScore, correctOptionIds });
}

export const POST = withRoute('quiz.assignment.submit', postHandler);
