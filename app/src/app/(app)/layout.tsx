import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';
import { isSetupComplete } from '@/lib/setup';
import { TWOFA_COOKIE, verifyTwoFactorCookie } from '@/lib/twofactor';
import { Sidebar } from '@/components/sidebar';
import { MobileNav } from '@/components/mobile-nav';

// The whole (app) group is behind auth + a setup gate that can redirect. It must
// never be statically prerendered (that bakes a build-time redirect into the
// page); force every route under this layout to render dynamically per request.
export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // First-run gate: nothing in the app works until the workspace is configured.
  if (!(await isSetupComplete())) {
    redirect('/setup');
  }

  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const userId = (session.user as any).id as string;
  const dbUser = (await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, totpEnabled: true } as any,
  })) as any;

  const cfg = await readConfig(['WS_NAME', 'WS_REQUIRE_2FA']);
  const workspaceName = cfg.WS_NAME || CONFIG_DEFAULTS.WS_NAME;
  const requireWs = cfg.WS_REQUIRE_2FA === 'true';
  const enabled = !!dbUser?.totpEnabled;
  const isAdmin = dbUser?.role === 'admin';

  // ── 2FA gate ──────────────────────────────────────────────
  // Workspace requires 2FA for admins but this admin hasn't enrolled → force setup.
  if (requireWs && isAdmin && !enabled) {
    redirect('/2fa/setup');
  }
  // 2FA is enabled for this user → require a valid "passed" cookie this session.
  if (enabled) {
    const ck = (await cookies()).get(TWOFA_COOKIE)?.value;
    if (!verifyTwoFactorCookie(ck, userId)) {
      redirect('/2fa');
    }
  }

  return (
    <div className="app-layout" style={{ height: '100vh', overflow: 'hidden' }}>
      <Sidebar workspaceName={workspaceName} />
      <main className="app-main">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
