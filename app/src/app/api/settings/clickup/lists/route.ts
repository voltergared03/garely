import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getClickUpListsCached } from '@/lib/clickup';

// GET /api/settings/clickup/lists — every ClickUp list, for the department/user pickers.
//
// Deliberately NOT folded into the main settings GET: it walks Spaces → Folders → Lists,
// so it costs ~20 ClickUp calls. The walk is cached for five minutes and shared by every
// tab; when ClickUp rate-limits us the last good snapshot comes back with `stale: true`
// (the UI shows a note) — a 502 only when there is nothing at all to show.
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const { lists, stale, error } = await getClickUpListsCached();
    return NextResponse.json({ lists, stale, error });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 });
  }
}
