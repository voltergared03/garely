import { NextRequest, NextResponse } from 'next/server';
import { isInternalAuthed } from '@/lib/internal-auth';
import { addScreenSegment, stopScreenSegment } from '@/lib/recording-orchestrator';

// POST /api/webhooks/recording-screen — the LiveKit agent reports a screen-share track
// starting/ending so we can record it as a passthrough TrackEgress segment (B2-lite,
// screen-audio mode). Internal-only. No-op unless a screen-audio recording is active.
export async function POST(req: NextRequest) {
  if (!isInternalAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { meetingId, roomName, trackId, action } = await req.json();
    if (!meetingId || !trackId || !action) {
      return NextResponse.json({ error: 'meetingId, trackId, action required' }, { status: 400 });
    }
    if (action === 'start') {
      if (!roomName) return NextResponse.json({ error: 'roomName required' }, { status: 400 });
      const ok = await addScreenSegment(meetingId, roomName, trackId);
      return NextResponse.json({ ok });
    }
    if (action === 'stop') {
      await stopScreenSegment(meetingId, trackId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
