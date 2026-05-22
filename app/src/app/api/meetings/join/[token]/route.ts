import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/meetings/join/:token — get meeting info by join token (for guest join page)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { joinToken: token },
    select: {
      id: true,
      title: true,
      description: true,
      scheduledAt: true,
      durationMin: true,
      status: true,
      allowGuests: true,
      createdBy: { select: { id: true, name: true, image: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 });
  }

  if (!meeting.allowGuests) {
    return NextResponse.json({ error: 'This meeting does not allow guests' }, { status: 403 });
  }

  if (meeting.status === 'cancelled') {
    return NextResponse.json({ error: 'This meeting has been cancelled' }, { status: 410 });
  }

  return NextResponse.json(meeting);
}
