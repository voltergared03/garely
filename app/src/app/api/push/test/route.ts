import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { sendPushToUsers } from '@/lib/push';
import { withRoute } from '@/lib/with-route';

export const dynamic = 'force-dynamic';

// POST /api/push/test — send a real Web Push to the current user's own devices.
// Validates the full pipeline (VAPID → push service → SW). Returns how many
// subscriptions it reached so the UI can distinguish "no subscription" from
// "delivered but the OS didn't display it".
async function postHandler() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id as string;

  const t = await getTranslations('push');
  const { sent, pruned } = await sendPushToUsers([userId], {
    title: 'Garely',
    body: t('testBody'),
    url: '/',
    tag: 'eam-test',
    type: 'test',
  });

  return NextResponse.json({ sent, pruned });
}

export const POST = withRoute('push.test', postHandler);
