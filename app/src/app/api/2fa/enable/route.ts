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

// POST /api/2fa/enable { code } — verify a code against the pending secret,
// turn 2FA on, and return one-time backup codes (shown once).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id as string;

  const rl = rateLimit(`2fa-enable:${userId}`, 10, 5 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Забагато спроб. Спробуйте через ${rl.retryAfter} с.` }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as any));
  const code = String(body.code || '').trim();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true } as any,
  }) as any;
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.totpEnabled) return NextResponse.json({ error: '2FA вже увімкнено' }, { status: 400 });

  const secret = decryptSecret(user.totpSecret);
  if (!secret) return NextResponse.json({ error: 'Спершу почніть налаштування 2FA' }, { status: 400 });
  if (!verifyTotp(secret, code)) {
    return NextResponse.json({ error: 'Невірний код. Спробуйте ще раз.' }, { status: 400 });
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
