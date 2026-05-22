import type { Metadata, Viewport } from 'next';
import { SessionProvider } from 'next-auth/react';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';
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
    icons: { icon: '/favicon.svg' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
