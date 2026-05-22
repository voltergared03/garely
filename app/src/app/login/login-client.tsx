'use client';

import { signIn } from 'next-auth/react';
import { Logo } from '@/components/ui/logo';
import { Globe, Lock } from 'lucide-react';

export function LoginClient({ wsName, wsDomain }: { wsName: string; wsDomain: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at 20% 0%, color-mix(in oklab, var(--accent) 14%, var(--bg)) 0%, var(--bg) 60%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', padding: '0 20px' }}>
        <div className="card fade-in" style={{ padding: '40px 36px', textAlign: 'center' }}>
          <div style={{ marginBottom: 24 }}>
            <Logo size={24} />
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Вітаємо в {wsName}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 32px', lineHeight: 1.5 }}>
            Self-hosted video conferencing з AI-транскрипцією та автоматичними звітами
          </p>

          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="btn"
            style={{
              width: '100%',
              padding: '14px 16px',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            <Globe size={16} /> Увійти через Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12, justifyContent: 'center', marginTop: 16 }}>
            <Lock size={12} /> Self-hosted{wsDomain ? ` · ${wsDomain}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
