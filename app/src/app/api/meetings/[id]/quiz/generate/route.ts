import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { withRoute } from '@/lib/with-route';
import { workspaceLocale } from '@/lib/i18n-server';
import { generateQuizQuestions } from '@/lib/quiz';

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

// POST /api/meetings/[id]/quiz/generate — AI-generate draft questions from the
// report. Upserts the meeting's (single) Quiz as a draft. Admin/creator only.
async function postHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const forbidden = await requireOwner(id, session.user.id, session.user.role);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({} as any));
  const count = Math.min(Math.max(parseInt(String(body.count ?? 5), 10) || 5, 3), 15);

  let questions;
  try {
    questions = await generateQuizQuestions(id, count);
  } catch (e: any) {
    const reason = e?.message === 'no_report' ? 'report_not_ready' : 'generation_failed';
    return NextResponse.json({ error: reason }, { status: reason === 'report_not_ready' ? 400 : 502 });
  }

  const loc = await workspaceLocale();
  const quiz = await prisma.quiz.upsert({
    where: { meetingId: id },
    create: {
      meetingId: id,
      createdById: session.user.id,
      status: 'draft',
      language: loc,
      openBook: typeof body.openBook === 'boolean' ? body.openBook : false,
      questions: questions as unknown as Prisma.InputJsonValue,
    },
    update: {
      status: 'draft',
      language: loc,
      questions: questions as unknown as Prisma.InputJsonValue,
      ...(typeof body.openBook === 'boolean' ? { openBook: body.openBook } : {}),
    },
  });

  return NextResponse.json({
    quiz: { id: quiz.id, status: quiz.status, openBook: quiz.openBook, questions },
  });
}

export const POST = withRoute('meetings.quiz.generate', postHandler);
