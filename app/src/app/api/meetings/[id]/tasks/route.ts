import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
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
  const { taskId, status, ...rest } = body;

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  // Ensure the task actually belongs to this meeting (block cross-meeting writes).
  if ((await meetingIdOfTask(taskId)) !== id) {
    return NextResponse.json({ error: t('taskNotInMeeting') }, { status: 404 });
  }

  try {
    const task = await prisma.meetingTask.update({
      where: { id: taskId },
      data: { status, ...rest },
      include: {
        assignee: { select: { id: true, name: true, image: true } },
      },
    });
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: t('taskNotFound') }, { status: 404 });
  }
}
