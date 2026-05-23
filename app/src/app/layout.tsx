import type { Metadata, Viewport } from 'next';
import { SessionProvider } from 'next-auth/react';
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <body>
        <PwaRegister />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
