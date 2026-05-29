import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';
import { withRoute } from '@/lib/with-route';

// GET /api/workspace/tz — the workspace IANA timezone, for client pages that
// render dates/times (so they don't fall back to the browser's zone).
async function getHandler() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const cfg = await readConfig(['WS_TIMEZONE']);
  return NextResponse.json({ tz: cfg.WS_TIMEZONE || CONFIG_DEFAULTS.WS_TIMEZONE });
}

export const GET = withRoute('workspace.tz', getHandler);
