'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/ui/logo';
import { Lock, Loader2 } from 'lucide-react';

export function ChangePasswordClient({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (next.length < 8) { setErr('Пароль — щонайменше 8 символів'); return; }
    if (next !== confirm) { setErr('Паролі не збігаються'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: forced ? undefined : current, newPassword: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setErr(d.error || 'Не вдалося змінити пароль'); setBusy(false); return; }
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
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at 20% 0%, color-mix(in oklab, var(--accent) 14%, var(--bg)) 0%, var(--bg) 60%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 400, width: '100%', padding: '24px 20px' }}>
        <div className="card fade-in" style={{ padding: '36px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <Logo size={22} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', textAlign: 'center' }}>
            {forced ? 'Встановіть новий пароль' : 'Зміна пароля'}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 22px', textAlign: 'center', lineHeight: 1.5 }}>
            {forced
              ? 'Це ваш перший вхід — задайте власний пароль, щоб продовжити.'
              : 'Введіть поточний і новий пароль.'}
          </p>

          <form onSubmit={submit}>
            {!forced && (
              <input
                className="field" type="password" autoComplete="current-password"
                placeholder="Поточний пароль" value={current}
                onChange={(e) => setCurrent(e.target.value)} style={{ marginBottom: 10 }}
              />
            )}
            <input
              className="field" type="password" autoComplete="new-password"
              placeholder="Новий пароль (мін. 8 символів)" value={next}
              onChange={(e) => setNext(e.target.value)} style={{ marginBottom: 10 }}
            />
            <input
              className="field" type="password" autoComplete="new-password"
              placeholder="Повторіть новий пароль" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {err && <div style={{ fontSize: 12.5, color: 'var(--red, #ef4444)', marginTop: 10 }}>{err}</div>}
            <button
              type="submit" className="btn btn-primary" disabled={busy}
              style={{ width: '100%', justifyContent: 'center', padding: '13px 16px', fontWeight: 600, marginTop: 16, gap: 8 }}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <Lock size={15} />} Зберегти пароль
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
