'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ShieldCheck, Copy, Check, Loader2, KeyRound, Download } from 'lucide-react';

/**
 * Reusable TOTP enrollment wizard: setup → scan QR / enter code → backup codes.
 * Used both on the forced /2fa/setup page (pass `redirectTo`) and inside the
 * Settings → Security modal (pass `onDone`).
 */
export function TwoFactorSetupFlow({
  onDone,
  onCancel,
  redirectTo,
}: {
  onDone?: () => void;
  onCancel?: () => void;
  redirectTo?: string;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [step, setStep] = useState<'loading' | 'scan' | 'backup'>('loading');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const start = useCallback(async () => {
    setStep('loading');
    setError('');
    try {
      const r = await fetch('/api/2fa/setup', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Не вдалося почати налаштування'); return; }
      setQr(d.qr);
      setSecret(d.secret);
      setStep('scan');
    } catch {
      setError('Помилка мережі');
    }
  }, []);

  useEffect(() => { start(); }, [start]);

  async function enable() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Невірний код'); setBusy(false); return; }
      setBackupCodes(d.backupCodes || []);
      setStep('backup');
    } catch {
      setError('Помилка мережі');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    // Refresh the session JWT so middleware sees totpEnabled=true promptly.
    await update?.().catch(() => {});
    if (redirectTo) {
      router.replace(redirectTo);
      router.refresh();
    } else {
      onDone?.();
    }
  }

  function copyCodes() {
    navigator.clipboard?.writeText(backupCodes.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const prettySecret = secret.replace(/(.{4})/g, '$1 ').trim();

  if (step === 'loading') {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
        <Loader2 size={22} className="spin" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13 }}>Готуємо ключ…</div>
        {error && <ErrorLine text={error} retry={start} />}
      </div>
    );
  }

  if (step === 'backup') {
    return (
      <div>
        <Header icon={<KeyRound size={18} />} title="Резервні коди" />
        <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.55, margin: '0 0 14px' }}>
          Збережіть ці коди в безпечному місці. Кожен працює <b>один раз</b> і знадобиться,
          якщо ви втратите доступ до додатку-автентифікатора.
        </p>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 16, marginBottom: 14,
        }}>
          {backupCodes.map((c) => (
            <div key={c} className="mono" style={{ fontSize: 14, letterSpacing: '0.04em', textAlign: 'center', color: 'var(--text)' }}>{c}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-sm" onClick={copyCodes} style={{ flex: 1, justifyContent: 'center' }}>
            {copied ? <><Check size={14} /> Скопійовано</> : <><Copy size={14} /> Копіювати</>}
          </button>
          <button className="btn btn-sm" onClick={downloadCodes(backupCodes)} style={{ flex: 1, justifyContent: 'center' }}>
            <Download size={14} /> Завантажити
          </button>
        </div>
        <button className="btn btn-primary" onClick={finish} style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}>
          Я зберіг коди — завершити
        </button>
      </div>
    );
  }

  // step === 'scan'
  return (
    <div>
      <Header icon={<ShieldCheck size={18} />} title="Підключення 2FA" />
      <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.55, margin: '0 0 16px' }}>
        Відскануйте QR-код у додатку (Google Authenticator, Authy, 1Password) або введіть ключ вручну.
      </p>

      {qr && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="2FA QR" width={208} height={208} style={{ borderRadius: 12, background: '#fff', padding: 8 }} />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div className="field-label">Ключ для ручного введення</div>
        <div className="mono" style={{
          fontSize: 13, letterSpacing: '0.08em', wordBreak: 'break-all',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '10px 12px', color: 'var(--text-2)',
        }}>{prettySecret}</div>
      </div>

      <div className="field-label">Код з додатку</div>
      <input
        className="field mono"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) enable(); }}
        style={{ fontSize: 20, letterSpacing: '0.3em', textAlign: 'center' }}
      />

      {error && <ErrorLine text={error} />}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {onCancel && (
          <button className="btn" onClick={onCancel} style={{ flex: '0 0 auto' }}>Скасувати</button>
        )}
        <button
          className="btn btn-primary"
          onClick={enable}
          disabled={busy || code.length !== 6}
          style={{ flex: 1, justifyContent: 'center', fontWeight: 600, opacity: code.length !== 6 ? 0.6 : 1 }}
        >
          {busy ? <Loader2 size={15} className="spin" /> : 'Увімкнути 2FA'}
        </button>
      </div>
    </div>
  );
}

function downloadCodes(codes: string[]) {
  return () => {
    const blob = new Blob([`EZmeet — резервні коди 2FA\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eam-meet-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
}

function Header({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{
        display: 'inline-flex', width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent-soft)', color: 'var(--accent-2)',
      }}>{icon}</span>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
    </div>
  );
}

function ErrorLine({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--red)', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
      {text}
      {retry && <button className="btn btn-sm" onClick={retry}>Повторити</button>}
    </div>
  );
}
