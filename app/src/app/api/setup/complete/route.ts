import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifySetupToken, markSetupComplete, provisionFirstOrg } from '@/lib/setup';

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
    // Multi-tenancy: create org #1 and make this first admin its OWNER (fresh
    // install). MUST happen here too — without it a Google-SSO install has no
    // org and every orgId-scoped query breaks. Shared with the password path.
    await provisionFirstOrg(userId);
  } catch {
    return NextResponse.json({ error: 'Could not promote user' }, { status: 500 });
  }

  // Burns the setup token and flips SETUP_COMPLETE → /setup is now locked.
  await markSetupComplete();

  return NextResponse.json({ ok: true });
}
