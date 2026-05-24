import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword, passwordPolicyError } from '@/lib/password';

export const dynamic = 'force-dynamic';

// POST /api/account/password { currentPassword?, newPassword } — change own password.
// Forced first-change (mustChangePassword, just logged in with a temp password)
// skips the current-password check; a voluntary change requires it.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id as string;

  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  const pwErr = passwordPolicyError(newPassword);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const user = (await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, mustChangePassword: true } as any,
  })) as any;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Require the current password only when voluntarily changing an EXISTING
  // password. A forced first-change (temp password) or an SSO account with no
  // password yet can set one directly — the authenticated session authorizes it.
  if (!user.mustChangePassword && user.passwordHash) {
    if (!(await verifyPassword(String(currentPassword || ''), user.passwordHash))) {
      return NextResponse.json({ error: 'Невірний поточний пароль' }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(String(newPassword));
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false } as any,
  });

  return NextResponse.json({ ok: true });
}
