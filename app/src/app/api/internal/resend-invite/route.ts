import { NextRequest, NextResponse } from 'next/server';
import { isInternalAuthed } from '@/lib/internal-auth';
import { sendMeetingInvite, type InviteKind } from '@/lib/meeting-invite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/internal/resend-invite — machine-only (x-internal-key) trigger to
// re-issue a meeting's calendar invite. Used for one-off maintenance, e.g. to
// push a refreshed join link into attendees' calendars after a link-scheme
// change. Body: { meetingId: string, kind?: "invite" | "update" | "cancel" }.
export async function POST(req: NextRequest) {
  if (!isInternalAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const meetingId = typeof body.meetingId === 'string' ? body.meetingId.trim() : '';
  const kind: InviteKind = ['invite', 'update', 'cancel'].includes(body.kind) ? body.kind : 'update';
  if (!meetingId) {
    return NextResponse.json({ error: 'meetingId required' }, { status: 400 });
  }
  await sendMeetingInvite(meetingId, kind);
  return NextResponse.json({ ok: true, meetingId, kind });
}
