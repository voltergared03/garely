import type { MetadataRoute } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';

// Read the workspace name per request so a configured instance gets its own
// install name. Tolerates a DB-less build (falls back to the default).
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = CONFIG_DEFAULTS.WS_NAME;
  try {
    const cfg = await readConfig(['WS_NAME']);
    if (cfg.WS_NAME) name = cfg.WS_NAME;
  } catch {
    /* DB unavailable at build → default */
  }

  const locale = await getLocale();
  const t = await getTranslations('nav');
  const short = name.length > 12 ? name.split(/\s+/)[0].slice(0, 12) : name;

  return {
    name,
    short_name: short,
    description: 'Self-hosted video conferencing with AI meeting intelligence',
    start_url: '/',
    scope: '/',
    id: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0b0d11',
    theme_color: '#0b0d11',
    lang: locale,
    dir: 'ltr',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: t('newMeeting'),
        short_name: t('newMeeting'),
        url: '/schedule',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: t('tasks'),
        short_name: t('tasks'),
        url: '/tasks',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: t('calendar'),
        short_name: t('calendar'),
        url: '/calendar',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
