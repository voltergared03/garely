import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncConnection, startWatch } from '@/lib/calendar-sync';
import { withRoute } from '@/lib/with-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/cron/calendar-sync?secret=XXX — every ~10 min: incremental-sync all
// active Google Calendar connections + renew push channels nearing expiry
// (events.watch lives ~7 days). This is also the safety net when push
// notifications are unavailable (e.g. unverified webhook domain).
async function getHandler(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const conns = await prisma.googleCalendarConnection.findMany({
    where: { status: { not: 'revoked' }, calendarId: { not: null } },
    take: 200,
  });

  let synced = 0;
  let renewed = 0;
  let failed = 0;
  for (const conn of conns) {
    try {
      await syncConnection(conn);
      synced++;
      const expiry = conn.channelExpiry?.getTime() ?? 0;
      if (expiry < Date.now() + 24 * 3600_000) {
        if (await startWatch(conn)) renewed++;
      }
    } catch (e) {
      failed++;
      console.error(`gcal cron: connection ${conn.id} sync failed:`, e);
    }
  }
  return NextResponse.json({ connections: conns.length, synced, renewed, failed });
}

export const GET = withRoute('cron.calendarSync', getHandler);
