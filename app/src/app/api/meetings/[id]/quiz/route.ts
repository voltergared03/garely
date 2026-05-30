import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRoute } from '@/lib/with-route';

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

const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().trim().min(1),
  type: z.enum(['single', 'multi']),
  options: z.array(z.object({ id: z.string().min(1), text: z.string().trim().min(1) })).min(2).max(8),
  correctOptionIds: z.array(z.string().min(1)).min(1),
  cites: z.array(z.number()).optional(),
});
const patchSchema = z.object({
  questions: z.array(questionSchema).min(1).max(30).optional(),
  openBook: z.boolean().optional(),
});

// GET /api/meetings/[id]/quiz — admin/creator: the quiz (with questions) + results
async function getHandler(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const forbidden = await requireOwner(id, session.user.id, session.user.role);
  if (forbidden) return forbidden;

  const quiz = await prisma.quiz.findUnique({
    where: { meetingId: id },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { assignedAt: 'asc' },
      },
    },
  });
  if (!quiz) return NextResponse.json({ quiz: null });

  return NextResponse.json({
    quiz: {
      id: quiz.id,
      status: quiz.status,
      openBook: quiz.openBook,
      questions: quiz.questions,
      assignments: quiz.assignments.map((a) => ({
        id: a.id,
        user: a.user,
        status: a.status,
        score: a.score,
        maxScore: a.maxScore,
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      })),
    },
  });
}

// PATCH /api/meetings/[id]/quiz — admin/creator: edit draft questions / openBook
async function patchHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const forbidden = await requireOwner(id, session.user.id, session.user.role);
  if (forbidden) return forbidden;

  const v = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!v.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const quiz = await prisma.quiz.findUnique({ where: { meetingId: id }, select: { id: true } });
  if (!quiz) return NextResponse.json({ error: 'quiz_not_found' }, { status: 404 });

  // Every correctOptionId must reference one of that question's options.
  if (v.data.questions) {
    for (const q of v.data.questions) {
      const optIds = new Set(q.options.map((o) => o.id));
      if (!q.correctOptionIds.every((c) => optIds.has(c))) {
        return NextResponse.json({ error: 'bad_correct_option' }, { status: 400 });
      }
    }
  }

  const updated = await prisma.quiz.update({
    where: { meetingId: id },
    data: {
      ...(v.data.questions ? { questions: v.data.questions as unknown as Prisma.InputJsonValue } : {}),
      ...(typeof v.data.openBook === 'boolean' ? { openBook: v.data.openBook } : {}),
    },
  });

  return NextResponse.json({
    quiz: { id: updated.id, status: updated.status, openBook: updated.openBook, questions: updated.questions },
  });
}

// DELETE /api/meetings/[id]/quiz — admin/creator removes the quiz and all of its
// assignments/results (cascade). Destructive; the UI confirms first.
async function deleteHandler(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const forbidden = await requireOwner(id, session.user.id, session.user.role);
  if (forbidden) return forbidden;
  const quiz = await prisma.quiz.findUnique({ where: { meetingId: id }, select: { id: true } });
  if (!quiz) return NextResponse.json({ error: 'quiz_not_found' }, { status: 404 });
  await prisma.quiz.delete({ where: { id: quiz.id } });
  return NextResponse.json({ ok: true });
}

export const GET = withRoute('meetings.quiz.get', getHandler);
export const PATCH = withRoute('meetings.quiz.update', patchHandler);
export const DELETE = withRoute('meetings.quiz.delete', deleteHandler);
