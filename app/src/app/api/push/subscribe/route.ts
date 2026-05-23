import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/push/subscribe — persist a PushSubscription for the current user.
// Body: a serialized PushSubscription { endpoint, keys: { p256dh, auth } }.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id as string;

  let sub: any;
  try {
    sub = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const endpoint: string | undefined = sub?.endpoint;
  const p256dh: string | undefined = sub?.keys?.p256dh;
  const authKey: string | undefined = sub?.keys?.auth;

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const ua = req.headers.get('user-agent')?.slice(0, 255) || null;

  // Endpoint is globally unique. Upsert so re-subscribing (or a device that
  // moved to a different account) just rebinds to the current user.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth: authKey, ua },
    update: { userId, p256dh, auth: authKey, ua, lastUsed: new Date() },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
