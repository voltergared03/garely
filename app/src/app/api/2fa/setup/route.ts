import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';
import { generateSecret, otpauthURL } from '@/lib/totp';
import { encryptSecret } from '@/lib/twofactor';
import { getTranslations } from 'next-intl/server';
import { withRoute } from '@/lib/with-route';

// POST /api/2fa/setup — generate a fresh TOTP secret + QR (not yet enabled).
// The secret is stored encrypted with totpEnabled still false; it only takes
// effect once /api/2fa/enable verifies a code.
async function postHandler() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id as string;

  const t = await getTranslations('errors');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, totpEnabled: true } as any,
  }) as any;
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.totpEnabled) {
    return NextResponse.json({ error: t('twoFaAlreadyEnabledDisableFirst') }, { status: 400 });
  }

  const cfg = await readConfig(['WS_NAME']);
  const issuer = cfg.WS_NAME || CONFIG_DEFAULTS.WS_NAME || 'EZmeet';
  const account = user.email || user.name || userId;

  const secret = generateSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: encryptSecret(secret), totpEnabled: false } as any,
  });

  const url = otpauthURL(secret, account, issuer);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });

  return NextResponse.json({ secret, otpauthUrl: url, qr });
}

export const POST = withRoute('2fa.setup', postHandler);
