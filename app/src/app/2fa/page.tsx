import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TwoFactorVerifyGate } from '@/components/twofa/verify-gate';

export const dynamic = 'force-dynamic';

export default async function TwoFactorPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const userId = (session.user as any).id as string;
  const u = (await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true } as any,
  })) as any;
  // Nothing to verify if 2FA isn't enabled.
  if (!u?.totpEnabled) redirect('/');

  return (
    <Suspense fallback={null}>
      <TwoFactorVerifyGate />
    </Suspense>
  );
}
