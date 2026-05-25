import { NextRequest, NextResponse } from 'next/server';
import { isInternalAuthed } from '@/lib/internal-auth';
import { generateMeetingReport } from '@/lib/regenerate';

export const maxDuration = 300;

// POST /api/webhooks/generate-report — internal (called by the LiveKit agent on
// room end). Generates the full report (summary + extended topic report) server-
// side and returns immediately; generation continues in the background so the
// agent is never blocked by the model latency / its own shutdown window.
export async function POST(req: NextRequest) {
  if (!isInternalAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const meetingId = String(body.meetingId || '');
  if (!meetingId) {
    return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
  }

  // Fire-and-forget: do not make the agent wait for DeepSeek.
  void generateMeetingReport(meetingId, { notify: true }).catch((e) =>
    console.error('generate-report failed:', e)
  );

  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}
