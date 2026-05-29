import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateMeetingReport } from '@/lib/regenerate';
import { withRoute } from '@/lib/with-route';

export const maxDuration = 300;

// POST /api/meetings/:id/regenerate — re-run report generation (e.g. after a
// failure). Recomputes AI tasks and costs model tokens, so it's restricted to
// an admin or the meeting creator. Fire-and-forget: returns 202 immediately and
// the report status flips generating → ready/failed in the background (the UI
// polls). notify:false so participants aren't re-notified/emailed on a retry.
async function postHandler(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  if (session.user.role !== 'admin') {
    const m = await prisma.meeting.findUnique({ where: { id }, select: { createdById: true } });
    if (!m || m.createdById !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  await prisma.meeting
    .update({ where: { id }, data: { reportStatus: 'generating', reportError: null } })
    .catch(() => {});
  void generateMeetingReport(id, { notify: false }).catch((e) =>
    console.error('manual regenerate failed:', e)
  );
  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}

export const POST = withRoute('meetings.report.regenerate', postHandler);
