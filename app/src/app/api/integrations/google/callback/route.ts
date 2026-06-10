import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publicBaseUrl } from '@/lib/config';
import { getSingletonOrgId } from '@/lib/org';
import {
  verifyState, exchangeCode, emailFromIdToken, saveTokens, ensureGarelyCalendar, GCAL_SCOPE,
} from '@/lib/google-calendar';
import { syncConnection, startWatch } from '@/lib/calendar-sync';
import { withRoute } from '@/lib/with-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/integrations/google/callback — OAuth redirect target. Identity comes
// from the HMAC-signed `state` (minted in /connect for the logged-in user), so
// the callback itself doesn't need a session cookie. On success: store tokens,
// find-or-create the dedicated "Garely" calendar, land back in Settings.
async function getHandler(req: NextRequest) {
  const base = await publicBaseUrl();
  const settingsUrl = (q: string) => NextResponse.redirect(`${base}/settings?gcal=${q}`);

  const sp = req.nextUrl.searchParams;
  if (sp.get('error')) return settingsUrl('denied');

  const userId = verifyState(sp.get('state'));
  const code = sp.get('code');
  if (!userId || !code) return settingsUrl('invalid');

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return settingsUrl('invalid');

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.scope?.includes(GCAL_SCOPE)) return settingsUrl('noscope');

    const membership = await prisma.membership.findFirst({ where: { userId }, select: { orgId: true } });
    const orgId = membership?.orgId ?? (await getSingletonOrgId());
    if (!orgId) return settingsUrl('error');

    const conn = await saveTokens({ userId, orgId }, tokens, {
      googleEmail: emailFromIdToken(tokens.id_token),
    });
    const calendarId = await ensureGarelyCalendar(conn);
    const ready = await prisma.googleCalendarConnection.update({ where: { id: conn.id }, data: { calendarId } });

    // Initial sweep + push channel — best-effort; the cron poller covers both.
    await syncConnection(ready).catch((e) => console.error('gcal initial sync failed:', e));
    await startWatch(ready).catch(() => {});

    return settingsUrl('connected');
  } catch (e) {
    console.error('google calendar connect failed:', e);
    return settingsUrl('error');
  }
}

export const GET = withRoute('integrations.google.callback', getHandler);
