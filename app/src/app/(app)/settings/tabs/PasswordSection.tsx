'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Key, Loader2 } from 'lucide-react';

// Set or change your own login password. SSO-only accounts (no password yet)
// can set one without a current password — the authenticated session authorizes it.
export function PasswordSection({ hasPassword: initialHas }: { hasPassword: boolean }) {
  const t = useTranslations();
  const [has, setHas] = useState(initialHas);
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (next.length < 8) { setMsg({ ok: false, text: t('settings.passwordMin8') }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(has ? { currentPassword: cur, newPassword: next } : { newPassword: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: has ? t('settings.passwordChanged') : t('settings.passwordSet') });
        setHas(true); setCur(''); setNext('');
        setTimeout(() => { setOpen(false); setMsg(null); }, 1800);
      } else {
        setMsg({ ok: false, text: d.error || t('settings.saveFailed') });
      }
    } catch { setMsg({ ok: false, text: t('settings.networkError') }); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t('settings.loginPassword')}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {has ? t('settings.loginPasswordHasDesc') : t('settings.loginPasswordSetDesc')}
          </div>
        </div>
        {!open && (
          <button className="btn btn-sm" onClick={() => { setOpen(true); setMsg(null); }} style={{ gap: 6, flexShrink: 0 }}>
            <Key size={13} /> {has ? t('common.edit') : t('settings.setPassword')}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10, maxWidth: 360 }}>
          {has && (
            <input className="field" type="password" autoComplete="current-password" placeholder={t('settings.currentPassword')}
              value={cur} onChange={(e) => setCur(e.target.value)} />
          )}
          <input className="field" type="password" autoComplete="new-password" placeholder={t('settings.newPasswordMin8')}
            value={next} onChange={(e) => setNext(e.target.value)} />
          {msg && <div style={{ fontSize: 12.5, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy || !next || (has && !cur)} style={{ gap: 6 }}>
              {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Key size={13} />} {t('common.save')}
            </button>
            <button className="btn btn-sm" onClick={() => { setOpen(false); setCur(''); setNext(''); setMsg(null); }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
