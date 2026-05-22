import { redirect } from 'next/navigation';
import { isSetupComplete } from '@/lib/setup';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';
import { LoginClient } from './login-client';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Before the workspace is configured there is no SSO to log in with.
  if (!(await isSetupComplete())) {
    redirect('/setup');
  }

  const cfg = await readConfig(['WS_NAME', 'WS_DOMAIN']);
  return (
    <LoginClient
      wsName={cfg.WS_NAME || CONFIG_DEFAULTS.WS_NAME}
      wsDomain={cfg.WS_DOMAIN || CONFIG_DEFAULTS.WS_DOMAIN}
    />
  );
}
