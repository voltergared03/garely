import type { MetadataRoute } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/config';

// The PWA install name is the product brand (constant), not the tenant's
// workspace name (WS_NAME), so it stays stable across workspaces.
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getLocale();
  const t = await getTranslations('nav');

  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
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
