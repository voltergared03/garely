'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { Globe, Lock, Loader2 } from 'lucide-react';

export function LoginClient({
  wsName,
  wsDomain,
  googleEnabled,
  passwordEnabled,
  selfReg,
}: {
  wsName: string;
  wsDomain: string;
  googleEnabled: boolean;
  passwordEnabled: boolean;
  selfReg: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (r?.error) {
        setErr('Невірний email або пароль');
        setBusy(false);
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setErr('Помилка мережі');
      setBusy(false);
    }
  };

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
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', padding: '24px 20px' }}>
        <div className="card fade-in" style={{ padding: '40px 36px', textAlign: 'center' }}>
          <div style={{ marginBottom: 24 }}>
            <Logo size={24} />
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Вітаємо в {wsName}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 28px', lineHeight: 1.5 }}>
            Self-hosted video conferencing з AI-транскрипцією та автоматичними звітами
          </p>

          {passwordEnabled && (
            <form onSubmit={submit} style={{ textAlign: 'left', marginBottom: googleEnabled ? 18 : 4 }}>
              <input
                className="field"
                type="email"
                autoComplete="username"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ marginBottom: 10 }}
              />
              <input
                className="field"
                type="password"
                autoComplete="current-password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {err && (
                <div style={{ fontSize: 12.5, color: 'var(--red, #ef4444)', marginTop: 10 }}>{err}</div>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !email.trim() || !password}
                style={{ width: '100%', justifyContent: 'center', padding: '13px 16px', fontWeight: 600, marginTop: 14, gap: 8 }}
              >
                {busy ? <Loader2 size={16} className="spin" /> : <Lock size={15} />} Увійти
              </button>
              {selfReg && (
                <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: 'var(--muted)' }}>
                  Немає акаунту?{' '}
                  <Link href="/register" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    Зареєструватися
                  </Link>
                </div>
              )}
            </form>
          )}

          {googleEnabled && passwordEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 18px', color: 'var(--muted-2)', fontSize: 11.5 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              або
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          )}

          {googleEnabled && (
            <button
              onClick={() => signIn('google', { callbackUrl: '/' })}
              className="btn"
              style={{ width: '100%', padding: '14px 16px', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}
            >
              <Globe size={16} /> Увійти через Google
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12, justifyContent: 'center', marginTop: 18 }}>
            <Lock size={12} /> Self-hosted{wsDomain ? ` · ${wsDomain}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
