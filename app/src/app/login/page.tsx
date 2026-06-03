import { redirect } from 'next/navigation';
import { isSetupComplete } from '@/lib/setup';
import { readConfig, CONFIG_DEFAULTS, getAuthConfig } from '@/lib/config';
import { LoginClient } from './login-client';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Before the workspace is configured there is no SSO to log in with.
  if (!(await isSetupComplete())) {
    redirect('/setup');
  }

  const [cfg, authCfg] = await Promise.all([
    readConfig(['WS_NAME']),
    getAuthConfig(),
  ]);
  return (
    <LoginClient
      wsName={cfg.WS_NAME || CONFIG_DEFAULTS.WS_NAME}
      googleEnabled={authCfg.googleEnabled}
      passwordEnabled={authCfg.passwordEnabled}
      selfReg={authCfg.selfReg}
    />
  );
}
