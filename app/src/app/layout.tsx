import type { Metadata, Viewport } from 'next';
import { SessionProvider } from 'next-auth/react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/config';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  // Product brand (constant) drives the browser title / PWA / Apple web-app name.
  // The per-workspace name (WS_NAME) is a tenant label shown inside the app shell.
  return {
    title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
    description: 'Self-hosted video conferencing with AI meeting intelligence',
    applicationName: PRODUCT_NAME,
    manifest: '/manifest.webmanifest',
    icons: {
      icon: '/favicon.svg',
      apple: '/icons/apple-touch-icon.png',
    },
    appleWebApp: {
      capable: true,
      title: PRODUCT_NAME,
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
