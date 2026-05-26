import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readConfig } from '@/lib/config';
import { TwoFactorSetupFlow } from '@/components/twofa/setup-flow';
import { SignOutLink } from '@/components/twofa/signout-link';

export const dynamic = 'force-dynamic';

export default async function TwoFactorSetupPage() {
  const t = await getTranslations();
  const session = await auth();
  if (!session?.user) redirect('/login');
  const userId = session.user.id as string;
  const u = (await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true } as any,
  })) as any;
  if (u?.totpEnabled) redirect('/'); // already enrolled → verify happens via /2fa

  const cfg = await readConfig(['WS_REQUIRE_2FA']);
  const forced = cfg.WS_REQUIRE_2FA === 'true' && session.user.role === 'admin';

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at 20% 0%, color-mix(in oklab, var(--accent) 14%, var(--bg)) 0%, var(--bg) 60%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        overflow: 'auto', padding: '32px 0',
      }}
    >
      <div style={{ maxWidth: 460, width: '100%', padding: '0 20px' }}>
        {forced && (
          <p style={{ textAlign: 'center', color: 'var(--amber)', fontSize: 13, margin: '0 0 14px' }}>
            {t('twofa.adminMustEnable')}
          </p>
        )}
        <div className="card fade-in" style={{ padding: '28px 28px' }}>
          <TwoFactorSetupFlow redirectTo="/" />
        </div>
        <SignOutLink />
      </div>
    </div>
  );
}
