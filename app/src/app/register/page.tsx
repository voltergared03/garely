import { redirect } from 'next/navigation';
import { isSetupComplete } from '@/lib/setup';
import { readConfig, CONFIG_DEFAULTS, getAuthConfig } from '@/lib/config';
import { RegisterClient } from './register-client';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  if (!(await isSetupComplete())) redirect('/setup');
  const authCfg = await getAuthConfig();
  if (!authCfg.selfReg) redirect('/login'); // self-registration disabled
  const cfg = await readConfig(['WS_NAME']);
  return <RegisterClient wsName={cfg.WS_NAME || CONFIG_DEFAULTS.WS_NAME} />;
}
