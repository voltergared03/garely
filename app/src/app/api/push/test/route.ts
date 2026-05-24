import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sendPushToUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

// POST /api/push/test — send a real Web Push to the current user's own devices.
// Validates the full pipeline (VAPID → push service → SW). Returns how many
// subscriptions it reached so the UI can distinguish "no subscription" from
// "delivered but the OS didn't display it".
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id as string;

  const { sent, pruned } = await sendPushToUsers([userId], {
    title: 'EZmeet',
    body: 'Тестове сповіщення ✓',
    url: '/',
    tag: 'eam-test',
    type: 'test',
  });

  return NextResponse.json({ sent, pruned });
}
