import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRoute } from '@/lib/with-route';

// GET /api/cron/cleanup?secret=XXX — periodic state hygiene (e.g. every 30 min).
// Backstops two cases where a webhook was lost or a process died:
//   1. Meetings stuck `live` long past their expected end (room_finished never
//      arrived) → mark ended so they leave the dashboard and enter the archive.
//   2. Recordings stuck `processing` for hours (egress crashed mid-recording) →
//      mark failed so the UI can show it instead of hanging.
// Purely time-based so it never depends on a live LiveKit/egress API call.

const LIVE_GRACE_MS = 3 * 60 * 60 * 1000;      // 3h past scheduled end
const REC_STUCK_MS = 6 * 60 * 60 * 1000;       // 6h in "processing"

async function getHandler(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = Date.now();

  // 1. Orphaned live meetings. Compute expected end per-meeting from
  //    (scheduledAt ?? createdAt) + durationMin, then add the grace window.
  const liveMeetings = await prisma.meeting.findMany({
    where: { status: 'live' },
    select: { id: true, scheduledAt: true, createdAt: true, durationMin: true },
  });
  const staleIds = liveMeetings
    .filter((m) => {
      const start = (m.scheduledAt ?? m.createdAt).getTime();
      const expectedEnd = start + (m.durationMin || 60) * 60_000;
      return expectedEnd + LIVE_GRACE_MS < now;
    })
    .map((m) => m.id);

  let endedMeetings = 0;
  if (staleIds.length > 0) {
    const res = await prisma.meeting.updateMany({
      where: { id: { in: staleIds }, status: 'live' },
      data: { status: 'ended', endedAt: new Date() },
    });
    endedMeetings = res.count;
  }

  // 2. Recordings stuck in "processing".
  const failedRecordings = await prisma.recording.updateMany({
    where: { status: 'processing', createdAt: { lt: new Date(now - REC_STUCK_MS) } },
    data: { status: 'failed' },
  });

  return NextResponse.json({ endedMeetings, failedRecordings: failedRecordings.count });
}

export const GET = withRoute('cron.cleanup', getHandler);
