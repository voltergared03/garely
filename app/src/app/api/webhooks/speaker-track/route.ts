import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isInternalAuthed } from '@/lib/internal-auth';

// POST /api/webhooks/speaker-track — register a per-speaker audio file written
// by the LiveKit agent (one WAV per participant per meeting). Internal-only.
export async function POST(req: NextRequest) {
  if (!isInternalAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      meetingId,
      participantIdentity,
      speakerId,
      speakerName,
      fileName,
      filePath,
      fileSize,
      durationSec,
      detectedLanguage,
      detectConfidence,
    } = body;

    if (!meetingId || !participantIdentity || !fileName || !filePath) {
      return NextResponse.json(
        { error: 'meetingId, participantIdentity, fileName, filePath required' },
        { status: 400 }
      );
    }

    // Guests have no User row — only attach speakerId when it resolves to a user.
    let validSpeakerId: string | null = null;
    if (speakerId) {
      const u = await prisma.user.findUnique({ where: { id: speakerId }, select: { id: true } });
      validSpeakerId = u?.id ?? null;
    }

    const track = await (prisma as any).speakerTrack.create({
      data: {
        meetingId,
        participantIdentity,
        speakerId: validSpeakerId,
        speakerName: speakerName || null,
        fileName,
        filePath,
        fileSize:
          typeof fileSize === 'number' && fileSize >= 0 ? BigInt(Math.round(fileSize)) : null,
        durationSec: typeof durationSec === 'number' ? durationSec : null,
        detectedLanguage: detectedLanguage || null,
        detectConfidence: typeof detectConfidence === 'number' ? detectConfidence : null,
      },
      // Select only non-BigInt fields so the JSON response serializes cleanly.
      select: { id: true },
    });

    return NextResponse.json({ id: track.id }, { status: 201 });
  } catch (e) {
    console.error('speaker-track webhook error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
