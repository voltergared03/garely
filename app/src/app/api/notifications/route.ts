import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isInternalAuthed } from '@/lib/internal-auth';
import { notify } from '@/lib/notify';
import { withRoute } from '@/lib/with-route';

// GET /api/notifications — list notifications for current user
async function getHandler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);

  const notifications = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
      ...(unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, read: false },
  });

  return NextResponse.json({ notifications, unreadCount });
}

// PATCH /api/notifications — mark notifications as read
async function patchHandler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { ids, markAllRead } = body;

  if (markAllRead) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (ids && Array.isArray(ids)) {
    await prisma.notification.updateMany({
      where: {
        id: { in: ids },
        userId: session.user.id,
      },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'ids or markAllRead required' }, { status: 400 });
}

// POST /api/notifications — create notification (internal/webhook use, or admin)
async function postHandler(req: NextRequest) {
  if (!isInternalAuthed(req)) {
    const session = await auth();
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await req.json();
  const { userId, userIds, type, title, body: notifBody, link, meetingId } = body;

  // Support single user or batch
  const targetUserIds: string[] = userIds || (userId ? [userId] : []);

  if (targetUserIds.length === 0 || !type || !title) {
    return NextResponse.json({ error: 'userId/userIds, type, and title required' }, { status: 400 });
  }

  const count = await notify({
    userIds: targetUserIds,
    type,
    title,
    body: notifBody || null,
    link: link || null,
    meetingId: meetingId || null,
  });

  return NextResponse.json({ count }, { status: 201 });
}

// DELETE /api/notifications — delete the current user's notifications.
// Body: { ids: string[] } to remove specific ones, or { all: true } to clear all.
// Always scoped to the authenticated user, so one user can't delete another's.
async function deleteHandler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ids, all } = await req.json().catch(() => ({} as any));

  if (all) {
    const { count } = await prisma.notification.deleteMany({
      where: { userId: session.user.id },
    });
    return NextResponse.json({ ok: true, deleted: count });
  }

  if (Array.isArray(ids) && ids.length > 0) {
    const { count } = await prisma.notification.deleteMany({
      where: { id: { in: ids }, userId: session.user.id },
    });
    return NextResponse.json({ ok: true, deleted: count });
  }

  return NextResponse.json({ error: 'ids or all required' }, { status: 400 });
}

export const GET = withRoute('notifications.list', getHandler);
export const PATCH = withRoute('notifications.mark-read', patchHandler);
export const POST = withRoute('notifications.create', postHandler);
export const DELETE = withRoute('notifications.delete', deleteHandler);
