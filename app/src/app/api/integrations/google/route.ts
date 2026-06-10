import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { disconnect } from '@/lib/google-calendar';
import { withRoute } from '@/lib/with-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/integrations/google — the current user's Google Calendar connection
// status (for the Settings card). Never returns token material.
async function getHandler() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { userId: session.user.id },
    select: {
      googleEmail: true, calendarId: true, status: true, lastError: true,
      lastSyncedAt: true, channelExpiry: true, createdAt: true,
    },
  });
  return NextResponse.json({ connected: !!conn, connection: conn });
}

// DELETE /api/integrations/google — disconnect: revoke at Google, stop the push
// channel, drop the connection row. Synced meetings stay (links just go stale).
async function deleteHandler() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: session.user.id } });
  if (conn) await disconnect(conn);
  return NextResponse.json({ ok: true });
}

export const GET = withRoute('integrations.google.status', getHandler);
export const DELETE = withRoute('integrations.google.disconnect', deleteHandler);
