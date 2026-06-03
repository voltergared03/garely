import { redirect } from 'next/navigation';
import { isSetupComplete } from '@/lib/setup';
import { getAuthConfig, PRODUCT_NAME } from '@/lib/config';
import { RegisterClient } from './register-client';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  if (!(await isSetupComplete())) redirect('/setup');
  const authCfg = await getAuthConfig();
  if (!authCfg.selfReg) redirect('/login'); // self-registration disabled
  return <RegisterClient wsName={PRODUCT_NAME} />;
}
