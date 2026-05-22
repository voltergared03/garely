import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isInternalAuthed } from '@/lib/internal-auth';

// POST /api/webhooks/transcript — store transcript segment (called by Python agent)
export async function POST(req: NextRequest) {
  // Internal-only: require the shared secret header (sent by the agent).
  if (!isInternalAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { meetingId, speakerName, speakerId, content, language, startTime, endTime, confidence } = body;

    if (!meetingId || !content) {
      return NextResponse.json({ error: 'meetingId and content required' }, { status: 400 });
    }

    const segment = await prisma.transcriptSegment.create({
      data: {
        meetingId,
        speakerName,
        speakerId: speakerId || null,
        content,
        language: language || null,
        startTime: startTime || 0,
        endTime: endTime || 0,
        confidence: confidence || null,
        isFinal: true,
      },
    });

    return NextResponse.json(segment, { status: 201 });
  } catch (e) {
    console.error('transcript webhook error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
