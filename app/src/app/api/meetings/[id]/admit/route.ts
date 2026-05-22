import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { userCanAccessMeeting } from '@/lib/access';

// GET /api/meetings/:id/admit — list pending guest join requests (any participant)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!(await userCanAccessMeeting(id, (session.user as any).id, (session.user as any).role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const pending = await (prisma as any).joinRequest.findMany({
    where: { meetingId: id, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, guestName: true, createdAt: true },
  });
  return NextResponse.json({ pending });
}

// POST /api/meetings/:id/admit — approve/deny a guest (any participant)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!(await userCanAccessMeeting(id, (session.user as any).id, (session.user as any).role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as any));
  const requestId = String(body.requestId || '');
  const action = body.action === 'approve' ? 'approved' : body.action === 'deny' ? 'denied' : null;
  if (!requestId || !action) {
    return NextResponse.json({ error: 'requestId та action обовʼязкові' }, { status: 400 });
  }

  const jr = await (prisma as any).joinRequest.findUnique({ where: { id: requestId } });
  if (!jr || jr.meetingId !== id) {
    return NextResponse.json({ error: 'Запит не знайдено' }, { status: 404 });
  }
  await (prisma as any).joinRequest.update({
    where: { id: requestId },
    data: { status: action, decidedAt: new Date() },
  });
  return NextResponse.json({ success: true, status: action });
}
