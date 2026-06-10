import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncConnection } from '@/lib/calendar-sync';
import { withRoute } from '@/lib/with-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/webhooks/google-calendar — Google push notification for a watched
// "Garely" calendar. No body to parse; identity = channel headers. We verify
// the channel against our stored channelId + channelToken, then run an
// incremental sync for that one connection. Always 200 (Google retries hard
// on errors, and a broken channel is harmless — cron polling covers it).
async function postHandler(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id') || '';
  const channelToken = req.headers.get('x-goog-channel-token') || '';
  const state = req.headers.get('x-goog-resource-state') || '';

  if (!channelId) return NextResponse.json({ ok: true });

  const conn = await prisma.googleCalendarConnection.findFirst({ where: { channelId } });
  if (!conn || !conn.channelToken || conn.channelToken !== channelToken) {
    return NextResponse.json({ ok: true }); // unknown/stale channel — ignore
  }
  if (state === 'sync') return NextResponse.json({ ok: true }); // channel handshake ping

  try {
    await syncConnection(conn);
  } catch (e) {
    console.error('gcal webhook sync failed:', e);
  }
  return NextResponse.json({ ok: true });
}

export const POST = withRoute('webhooks.googleCalendar', postHandler);
