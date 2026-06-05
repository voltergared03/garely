import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { userCanAccessMeeting, meetingIdOfTask } from '@/lib/access';
import { listMeetingTasks, updateTask } from '@/lib/tasks';

// GET /api/meetings/:id/tasks — list tasks for a meeting (top-level action items).
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

  // Top-level tasks only — AI-generated subtasks belong under their parent.
  return NextResponse.json(await listMeetingTasks(id));
}

// PATCH /api/meetings/:id/tasks — update a task (status/title/assignee/…).
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

  // Whitelist updatable fields — never spread the raw body. Reassigning from the
  // report collapses the assignee set to the chosen person (updateTask handles it).
  const fields: Parameters<typeof updateTask>[1] = {};
  if (typeof body.status === 'string') fields.status = body.status;
  if (typeof body.title === 'string' && body.title.trim()) fields.title = body.title.trim();
  if (body.description !== undefined) fields.description = body.description ?? null;
  if (typeof body.priority === 'string') fields.priority = body.priority;
  if (body.dueDate !== undefined) fields.dueDate = body.dueDate ?? null;
  if (typeof body.sortOrder === 'number') fields.sortOrder = body.sortOrder;
  if (body.assigneeId !== undefined) fields.assigneeId = body.assigneeId || null;

  const result = await updateTask(taskId, fields);
  if (!result) return NextResponse.json({ error: t('taskNotFound') }, { status: 404 });
  return NextResponse.json(result.task);
}
