import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { requireMeetingAccess } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';

// GET /api/meetings/:id/admit — list pending guest join requests (any participant)
async function getHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMeetingAccess(id);
  if (guard instanceof Response) return guard;
  const pending = await prisma.joinRequest.findMany({
    where: { meetingId: id, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, guestName: true, createdAt: true },
  });
  return NextResponse.json({ pending });
}

// POST /api/meetings/:id/admit — approve/deny a guest (any participant)
async function postHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMeetingAccess(id);
  if (guard instanceof Response) return guard;
  const t = await getTranslations('errors');
  const body = await req.json().catch(() => ({} as any));
  const requestId = String(body.requestId || '');
  const action = body.action === 'approve' ? 'approved' : body.action === 'deny' ? 'denied' : null;
  if (!requestId || !action) {
    return NextResponse.json({ error: t('requestIdAndActionRequired') }, { status: 400 });
  }

  const jr = await prisma.joinRequest.findUnique({ where: { id: requestId } });
  if (!jr || jr.meetingId !== id) {
    return NextResponse.json({ error: t('joinRequestNotFound') }, { status: 404 });
  }
  await prisma.joinRequest.update({
    where: { id: requestId },
    data: { status: action, decidedAt: new Date() },
  });
  return NextResponse.json({ success: true, status: action });
}

export const GET = withRoute('meetings.admit.list', getHandler);
export const POST = withRoute('meetings.admit.decide', postHandler);
