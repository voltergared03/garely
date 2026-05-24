import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyTotp } from '@/lib/totp';
import {
  decryptSecret,
  matchBackupCode,
  makeTwoFactorCookie,
  TWOFA_COOKIE,
  TWOFA_COOKIE_OPTS,
} from '@/lib/twofactor';
import { rateLimit, rateLimitReset } from '@/lib/rate-limit';
import { getTranslations } from 'next-intl/server';

// POST /api/2fa/verify { code } — verify a TOTP or backup code for the current
// session and set the short-lived "2FA passed" cookie. Backup codes are single-use.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id as string;

  const t = await getTranslations('errors');
  const rl = rateLimit(`2fa-verify:${userId}`, 8, 5 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: t('tooManyAttemptsRetry', { seconds: rl.retryAfter }) }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as any));
  const code = String(body.code || '').trim();
  if (!code) return NextResponse.json({ error: t('enterCode') }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true, totpBackupCodes: true } as any,
  }) as any;
  if (!user?.totpEnabled) return NextResponse.json({ error: t('twoFaNotEnabled') }, { status: 400 });

  const secret = decryptSecret(user.totpSecret);
  let ok = !!secret && verifyTotp(secret, code);
  let backupUsed = false;
  let remaining: number | undefined;

  if (!ok) {
    const hashes = (user.totpBackupCodes as string[] | null) || [];
    const idx = matchBackupCode(hashes, code);
    if (idx !== -1) {
      ok = true;
      backupUsed = true;
      const next = hashes.filter((_, i) => i !== idx);
      remaining = next.length;
      await prisma.user.update({
        where: { id: userId },
        data: { totpBackupCodes: next } as any,
      });
    }
  }

  if (!ok) return NextResponse.json({ error: t('invalidCode') }, { status: 400 });

  rateLimitReset(`2fa-verify:${userId}`);
  const res = NextResponse.json({ success: true, backupUsed, remaining });
  res.cookies.set(TWOFA_COOKIE, makeTwoFactorCookie(userId), TWOFA_COOKIE_OPTS);
  return res;
}
