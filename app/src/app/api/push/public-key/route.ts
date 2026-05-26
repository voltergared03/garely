import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getVapidConfig } from '@/lib/push';
import { withRoute } from '@/lib/with-route';

export const dynamic = 'force-dynamic';

// GET /api/push/public-key — VAPID public key the browser needs to subscribe.
async function getHandler() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { publicKey } = await getVapidConfig();
  return NextResponse.json({ publicKey });
}

export const GET = withRoute('push.public-key', getHandler);
