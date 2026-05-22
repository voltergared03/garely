'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export function SignOutLink({ label = 'Вийти з акаунту' }: { label?: string }) {
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => signOut({ callbackUrl: '/login' })}
      style={{ color: 'var(--muted)', margin: '14px auto 0', display: 'flex' }}
    >
      <LogOut size={13} /> {label}
    </button>
  );
}
