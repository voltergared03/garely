import { redirect } from 'next/navigation';
import { isSetupComplete } from '@/lib/setup';
import { getAuthConfig, PRODUCT_NAME } from '@/lib/config';
import { LoginClient } from './login-client';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Before the workspace is configured there is no SSO to log in with.
  if (!(await isSetupComplete())) {
    redirect('/setup');
  }

  const authCfg = await getAuthConfig();
  return (
    <LoginClient
      wsName={PRODUCT_NAME}
      googleEnabled={authCfg.googleEnabled}
      passwordEnabled={authCfg.passwordEnabled}
      selfReg={authCfg.selfReg}
    />
  );
}
