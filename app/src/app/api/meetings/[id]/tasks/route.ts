import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { userCanAccessMeeting, meetingIdOfTask } from '@/lib/access';

// GET /api/meetings/:id/tasks — list tasks for a meeting
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!(await userCanAccessMeeting(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tasks = await prisma.meetingTask.findMany({
    where: { meetingId: id },
    include: {
      assignee: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(tasks);
}

// PATCH /api/meetings/:id/tasks — update a task status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!(await userCanAccessMeeting(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const t = await getTranslations('errors');
  const body = await req.json();
  const { taskId } = body;

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  // Ensure the task actually belongs to this meeting (block cross-meeting writes).
  if ((await meetingIdOfTask(taskId)) !== id) {
    return NextResponse.json({ error: t('taskNotInMeeting') }, { status: 404 });
  }

  // Whitelist updatable fields — never spread the raw body.
  const data: Prisma.MeetingTaskUncheckedUpdateInput = {};
  if (typeof body.status === 'string') {
    data.status = body.status;
    data.completedAt = body.status === 'done' ? new Date() : null;
  }
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim();
  if (body.description !== undefined) data.description = body.description ?? null;
  if (typeof body.priority === 'string') data.priority = body.priority;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder;
  if (body.assigneeId !== undefined) {
    data.assigneeId = body.assigneeId || null;
    if (body.assigneeId) {
      const u = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { name: true } });
      data.assigneeName = u?.name ?? null;
    } else {
      data.assigneeName = null;
    }
  }

  try {
    const task = await prisma.meetingTask.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, name: true, image: true } },
      },
    });
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: t('taskNotFound') }, { status: 404 });
  }
}
