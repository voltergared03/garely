import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyTotp } from '@/lib/totp';
import {
  decryptSecret,
  generateBackupCodes,
  makeTwoFactorCookie,
  TWOFA_COOKIE,
  TWOFA_COOKIE_OPTS,
} from '@/lib/twofactor';
import { rateLimit, rateLimitReset } from '@/lib/rate-limit';
import { getTranslations } from 'next-intl/server';

// POST /api/2fa/enable { code } — verify a code against the pending secret,
// turn 2FA on, and return one-time backup codes (shown once).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id as string;

  const t = await getTranslations('errors');
  const rl = rateLimit(`2fa-enable:${userId}`, 10, 5 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: t('tooManyAttemptsRetry', { seconds: rl.retryAfter }) }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as any));
  const code = String(body.code || '').trim();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true } as any,
  }) as any;
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.totpEnabled) return NextResponse.json({ error: t('twoFaAlreadyEnabled') }, { status: 400 });

  const secret = decryptSecret(user.totpSecret);
  if (!secret) return NextResponse.json({ error: t('twoFaStartSetupFirst') }, { status: 400 });
  if (!verifyTotp(secret, code)) {
    return NextResponse.json({ error: t('invalidCodeRetry') }, { status: 400 });
  }

  const { plain, hashed } = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: true, totpBackupCodes: hashed } as any,
  });
  rateLimitReset(`2fa-enable:${userId}`);

  const res = NextResponse.json({ success: true, backupCodes: plain });
  res.cookies.set(TWOFA_COOKIE, makeTwoFactorCookie(userId), TWOFA_COOKIE_OPTS);
  return res;
}
