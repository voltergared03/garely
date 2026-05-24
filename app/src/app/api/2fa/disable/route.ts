import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyTotp } from '@/lib/totp';
import { decryptSecret, matchBackupCode, TWOFA_COOKIE } from '@/lib/twofactor';
import { rateLimit, rateLimitReset } from '@/lib/rate-limit';
import { getTranslations } from 'next-intl/server';

// POST /api/2fa/disable { code } — verify a current TOTP or backup code, then
// turn 2FA off and wipe the secret + backup codes.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id as string;

  const t = await getTranslations('errors');
  const rl = rateLimit(`2fa-disable:${userId}`, 8, 5 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: t('tooManyAttemptsRetry', { seconds: rl.retryAfter }) }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as any));
  const code = String(body.code || '').trim();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true, totpBackupCodes: true } as any,
  }) as any;
  if (!user?.totpEnabled) return NextResponse.json({ error: t('twoFaNotEnabled') }, { status: 400 });

  const secret = decryptSecret(user.totpSecret);
  const ok =
    (!!secret && verifyTotp(secret, code)) ||
    matchBackupCode((user.totpBackupCodes as string[] | null) || [], code) !== -1;
  if (!ok) return NextResponse.json({ error: t('invalidCode') }, { status: 400 });

  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodes: null } as any,
  });
  rateLimitReset(`2fa-disable:${userId}`);

  const res = NextResponse.json({ success: true });
  res.cookies.set(TWOFA_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
