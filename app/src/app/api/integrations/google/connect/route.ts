import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getGoogleConfig } from '@/lib/config';
import { buildAuthUrl } from '@/lib/google-calendar';
import { withRoute } from '@/lib/with-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/integrations/google/connect — kick off the per-user Google Calendar
// OAuth consent (separate from the SSO login flow; works for password users too).
async function getHandler() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { clientId, clientSecret } = await getGoogleConfig();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth is not configured' }, { status: 503 });
  }
  return NextResponse.redirect(await buildAuthUrl(session.user.id));
}

export const GET = withRoute('integrations.google.connect', getHandler);
