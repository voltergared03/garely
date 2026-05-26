import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifySetupToken, markSetupComplete } from '@/lib/setup';

// POST /api/setup/complete { token } — promote the signed-in user to admin and
// finalize setup. Requires BOTH a valid setup token AND an authenticated session
// (the person who just signed in via Google during the wizard).
export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));

  if (!(await verifySetupToken(token))) {
    return NextResponse.json({ error: 'Invalid or expired setup token' }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in with Google before finishing setup' }, { status: 401 });
  }

  const userId = session.user.id as string;
  try {
    await prisma.user.update({ where: { id: userId }, data: { role: 'admin' } });
  } catch {
    return NextResponse.json({ error: 'Could not promote user' }, { status: 500 });
  }

  // Burns the setup token and flips SETUP_COMPLETE → /setup is now locked.
  await markSetupComplete();

  return NextResponse.json({ ok: true });
}
