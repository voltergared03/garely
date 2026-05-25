import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/meetings/:id/speaker-tracks — list per-speaker audio tracks captured
// for this meeting (used by the report UI to offer "fix language & regenerate").
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: meetingId } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
