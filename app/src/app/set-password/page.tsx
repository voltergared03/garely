import { SetPasswordClient } from './set-password-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set password · EZmeet' };

// Public page (outside the (app) auth gate): invited users create their first
// password here via the one-time token from their invitation email.
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <SetPasswordClient token={token || ''} />;
}
