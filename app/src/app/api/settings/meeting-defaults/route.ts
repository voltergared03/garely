import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';
import { withRoute } from '@/lib/with-route';

// GET /api/settings/meeting-defaults — the four per-meeting switches as the
// workspace policy says they should START, readable by any signed-in user.
//
// The full workspace endpoint is admin-only, so the schedule form could never read
// it and hard-coded all four switches to `true` instead. That quietly made the
// admin's "meeting policies" dead for scheduled meetings: an admin who turned live
// transcription off still saw every new-meeting form default to on, and the API
// only applied the policy when a field was OMITTED — which the form never did.
// This is the read-only slice the form needs, and nothing else.
async function getHandler() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const keys = ['WS_LIVE_TRANSCRIPTION', 'WS_AI_SUMMARY', 'WS_TASK_CREATION', 'WS_GUEST_ACCESS'];
  const saved = await readConfig(keys);
  const on = (k: string) => (saved[k] ?? CONFIG_DEFAULTS[k]) === 'true';
  return NextResponse.json({
    transcription: on('WS_LIVE_TRANSCRIPTION'),
    aiReport: on('WS_AI_SUMMARY'),
    taskCreation: on('WS_TASK_CREATION'),
    allowGuests: on('WS_GUEST_ACCESS'),
  });
}

export const GET = withRoute('settings.meeting-defaults', getHandler);
