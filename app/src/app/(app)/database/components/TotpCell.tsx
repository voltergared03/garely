'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { KeyRound, Copy, Check, X } from 'lucide-react';
import type { TotpView } from '../lib/types';

const asView = (value: unknown): TotpView =>
  value && typeof value === 'object' && 'set' in (value as object) ? (value as TotpView) : { set: false };

/**
 * "2FA code" cell. The secret is stored encrypted server-side and never reaches
 * the client — this only ever receives the live code + a countdown, and only
 * sends a freshly pasted base32 secret up when the user sets/replaces the key.
 */
export function TotpCell({
  value,
  rowId,
  fieldId,
  onCommit,
}: {
  value: unknown;
  rowId?: string;
  fieldId: string;
  onCommit: (value: unknown) => void;
}) {
  const t = useTranslations('database');
  const tc = useTranslations('common');
  const [view, setView] = useState<TotpView>(() => asView(value));
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-seed when the cell value changes (e.g. after a row refetch or a set).
  useEffect(() => {
    setView(asView(value));
  }, [value]);

  // Tick down; when the window elapses, fetch the next code from the server.
  useEffect(() => {
    if (!view.set || !rowId || editing) return;
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const res = await fetch(`/api/rows/${rowId}/totp/${fieldId}`);
        if (res.ok) setView(await res.json());
      } catch {
        /* keep last code; try again next tick */
      }
      fetching = false;
    };
    const iv = setInterval(() => {
      setView((cur) => {
        const rem = (cur.remainingSec ?? 0) - 1;
        if (rem <= 0) {
          refresh();
          return { ...cur, remainingSec: 0 };
        }
        return { ...cur, remainingSec: rem };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [view.set, rowId, fieldId, editing]);

  const submit = (raw: string) => {
    const s = raw.trim();
    setEditing(false);
    if (s) onCommit(s);
  };

  const copy = async () => {
    if (!view.code) return;
    try {
      await navigator.clipboard.writeText(view.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  // ── Set / replace mode ───────────────────────────────────────────
  if (editing || !view.set) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', height: '100%', padding: '0 8px' }}>
        <KeyRound size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          autoFocus={editing}
          defaultValue=""
          placeholder={t('totpPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit((e.target as HTMLInputElement).value);
            else if (e.key === 'Escape' && view.set) setEditing(false);
          }}
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: 13, outline: 'none' }}
        />
        <button
          type="button"
          aria-label={tc('save')}
          onClick={() => submit(inputRef.current?.value ?? '')}
          style={iconBtn}
        >
          <Check size={14} style={{ color: 'var(--accent)' }} />
        </button>
        {view.set && (
          <button type="button" aria-label={tc('cancel')} onClick={() => setEditing(false)} style={iconBtn}>
            <X size={13} />
          </button>
        )}
      </div>
    );
  }

  // ── Display mode ─────────────────────────────────────────────────
  const code = view.code ?? '------';
  const pretty = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', height: '100%', padding: '0 8px', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={copy}
        title={t('totpCopy')}
        className="mono"
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
          fontSize: 15, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text)',
          display: 'inline-flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pretty}
        {copied ? <Check size={13} style={{ color: 'var(--green, #10b981)' }} /> : <Copy size={12} style={{ color: 'var(--muted)' }} />}
      </button>
      <Ring remaining={view.remainingSec ?? 0} period={view.period ?? 30} />
      <div style={{ flex: 1 }} />
      <button type="button" aria-label={t('totpReplaceKey')} title={t('totpReplaceKey')} onClick={() => setEditing(true)} style={iconBtn}>
        <KeyRound size={13} />
      </button>
    </div>
  );
}

function Ring({ remaining, period }: { remaining: number; period: number }) {
  const r = 6;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, period > 0 ? remaining / period : 0));
  const low = remaining <= 5;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }} title={`${remaining}s`}>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r={r} fill="none" stroke="var(--border-2, var(--border))" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke={low ? 'var(--red, #ef4444)' : 'var(--accent)'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          transform="rotate(-90 8 8)"
          style={{ transition: 'stroke-dashoffset .95s linear' }}
        />
      </svg>
    </span>
  );
}

const iconBtn: CSSProperties = {
  border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 3, borderRadius: 5, flexShrink: 0,
};
