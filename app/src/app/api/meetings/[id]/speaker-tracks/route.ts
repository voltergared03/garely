import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { userCanAccessMeeting } from '@/lib/access';
import { withRoute } from '@/lib/with-route';

// GET /api/meetings/:id/speaker-tracks — list per-speaker audio tracks captured
// for this meeting (used by the report UI to offer "fix language & regenerate").
async function getHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: meetingId } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await userCanAccessMeeting(meetingId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tracks = await prisma.speakerTrack.findMany({
    where: { meetingId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      speakerId: true,
      participantIdentity: true,
      speakerName: true,
      durationSec: true,
      detectedLanguage: true,
    },
  });

  return NextResponse.json(tracks);
}

export const GET = withRoute('meetings.speaker-tracks', getHandler);
