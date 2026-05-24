import type { Metadata, Viewport } from 'next';
import { SessionProvider } from 'next-auth/react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  let wsName = CONFIG_DEFAULTS.WS_NAME;
  try {
    const cfg = await readConfig(['WS_NAME']);
    if (cfg.WS_NAME) wsName = cfg.WS_NAME;
  } catch {
    /* DB unavailable (e.g. at build) → fall back to default */
  }
  return {
    title: { default: wsName, template: `%s · ${wsName}` },
    description: 'Self-hosted video conferencing with AI meeting intelligence',
    applicationName: wsName,
    manifest: '/manifest.webmanifest',
    icons: {
      icon: '/favicon.svg',
      apple: '/icons/apple-touch-icon.png',
    },
    appleWebApp: {
      capable: true,
      title: wsName,
      statusBarStyle: 'black-translucent',
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0d11',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <PwaRegister />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SessionProvider>{children}</SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
