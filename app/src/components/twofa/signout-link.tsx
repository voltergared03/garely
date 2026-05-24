'use client';

import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';

export function SignOutLink({ label }: { label?: string }) {
  const t = useTranslations();
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => signOut({ callbackUrl: '/login' })}
      style={{ color: 'var(--muted)', margin: '14px auto 0', display: 'flex' }}
    >
      <LogOut size={13} /> {label ?? t('twofa.signOutAccount')}
    </button>
  );
}
