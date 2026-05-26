import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { ChangePasswordClient } from './change-password-client';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  return <ChangePasswordClient forced={!!session.user.mustChangePassword} />;
}
