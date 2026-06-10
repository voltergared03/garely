import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { userCanAccessMeeting } from '@/lib/access';
import { withRoute } from '@/lib/with-route';

// GET /api/meetings/join/:token — get meeting info by join token (for the join
// page). This is the ONE canonical invite link, so it must serve both guests
// AND signed-in members; access narrows by who's asking, not a blanket block.
async function getHandler(
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

  // Guests-disabled meeting: only a signed-in member with access may view it
  // (the calendar invite link reaches members too — don't lock them out).
  if (!meeting.allowGuests) {
    const session = await auth();
    const ok = !!session?.user &&
      await userCanAccessMeeting(meeting.id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: 'This meeting does not allow guests' }, { status: 403 });
    }
  }

  if (meeting.status === 'cancelled') {
    return NextResponse.json({ error: 'This meeting has been cancelled', reason: 'cancelled' }, { status: 410 });
  }

  if (meeting.status === 'ended') {
    return NextResponse.json({ error: 'This meeting has ended', reason: 'ended' }, { status: 410 });
  }

  return NextResponse.json(meeting);
}

export const GET = withRoute('meetings.join', getHandler);
