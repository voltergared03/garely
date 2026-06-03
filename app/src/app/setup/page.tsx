import { redirect } from 'next/navigation';
import { isSetupComplete } from '@/lib/setup';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';
import { SetupWizard } from './setup-wizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Setup · Garely' };

export default async function SetupPage() {
  // Once configured, /setup is permanently locked.
  if (await isSetupComplete()) {
    redirect('/');
  }

  const cfg = await readConfig(['WS_NAME', 'WS_DOMAIN', 'WS_TIMEZONE', 'WS_LANGUAGE', 'GOOGLE_CLIENT_ID']);
  return (
    <SetupWizard
      initial={{
        wsName: cfg.WS_NAME || '',
        wsDomain: cfg.WS_DOMAIN || '',
        wsTimezone: cfg.WS_TIMEZONE || CONFIG_DEFAULTS.WS_TIMEZONE,
        wsLanguage: cfg.WS_LANGUAGE || CONFIG_DEFAULTS.WS_LANGUAGE,
        hasGoogleId: !!cfg.GOOGLE_CLIENT_ID,
      }}
    />
  );
}
