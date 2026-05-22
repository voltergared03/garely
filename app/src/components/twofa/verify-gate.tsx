'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ShieldCheck, Loader2, LogOut } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

export function TwoFactorVerifyGate() {
  const router = useRouter();
  const params = useSearchParams();
  // Only allow local, single-slash paths — block open-redirect via ?next=
  const rawNext = params.get('next') || '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [useBackup, setUseBackup] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Невірний код'); setBusy(false); return; }
      router.replace(next);
      router.refresh();
    } catch {
      setError('Помилка мережі');
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at 20% 0%, color-mix(in oklab, var(--accent) 14%, var(--bg)) 0%, var(--bg) 60%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', padding: '0 20px' }}>
        <div className="card fade-in" style={{ padding: '36px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <Logo size={22} />
          </div>
          <div style={{
            display: 'inline-flex', width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-soft)', color: 'var(--accent-2)', margin: '0 auto 14px', position: 'relative', left: '50%', transform: 'translateX(-50%)',
          }}>
            <ShieldCheck size={20} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>
            Підтвердження входу
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', margin: '0 0 22px', lineHeight: 1.5 }}>
            {useBackup
              ? 'Введіть один із резервних кодів.'
              : 'Введіть 6-значний код з додатку-автентифікатора.'}
          </p>

          <input
            className="field mono"
            autoFocus
            inputMode={useBackup ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            placeholder={useBackup ? 'XXXX-XXXX' : '000000'}
            value={code}
            onChange={(e) => {
              const v = useBackup ? e.target.value.toUpperCase().slice(0, 9) : e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(v);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            style={{ fontSize: 22, letterSpacing: '0.3em', textAlign: 'center' }}
          />

          {error && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--red)', textAlign: 'center' }}>{error}</div>
          )}

          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={busy || (!useBackup && code.length !== 6) || (useBackup && code.length < 8)}
            style={{ width: '100%', justifyContent: 'center', fontWeight: 600, marginTop: 16 }}
          >
            {busy ? <Loader2 size={15} className="spin" /> : 'Підтвердити'}
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setUseBackup((v) => !v); setCode(''); setError(''); }}
              style={{ color: 'var(--accent-2)' }}
            >
              {useBackup ? 'Ввести код з додатку' : 'Використати резервний код'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => signOut({ callbackUrl: '/login' })} style={{ color: 'var(--muted)' }}>
              <LogOut size={13} /> Вийти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
