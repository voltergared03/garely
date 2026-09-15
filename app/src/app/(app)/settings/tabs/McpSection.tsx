'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plug, Loader2, Trash2, Copy, Check } from 'lucide-react';
import s from './McpSection.module.css';

interface TokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Personal tokens for the MCP endpoint — how a person points Claude at this
 * workspace. The token is theirs, not the workspace's: an agent holding it reads
 * exactly the meetings its owner can open, so it is created and revoked here on
 * the profile, never by an admin on someone else's behalf.
 *
 * The plaintext exists for one render. There is no "show again": the server keeps
 * only a hash, and a lost token is replaced, not recovered.
 */
export function McpSection() {
  const t = useTranslations();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch('/api/account/mcp-tokens').then((r) => (r.ok ? r.json() : null));
      if (Array.isArray(d?.tokens)) setTokens(d.tokens);
    } catch { /* the list just stays as it was */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr(t('settings.mcpNameRequired')); return; }
    setBusy(true); setErr(null); setFresh(null); setCopied(false);
    try {
      const res = await fetch('/api/account/mcp-tokens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.token) {
        setFresh(d.token);
        setName('');
        await load();
      } else {
        setErr(d.error === 'too_many_tokens' ? t('settings.mcpTooMany') : t('settings.error'));
      }
    } catch { setErr(t('settings.networkError')); }
    finally { setBusy(false); }
  };

  const revoke = async (row: TokenRow) => {
    if (!confirm(t('settings.mcpRevokeConfirm', { name: row.name }))) return;
    const prev = tokens;
    setTokens((ts) => ts.filter((x) => x.id !== row.id));
    try {
      const res = await fetch(`/api/account/mcp-tokens?id=${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('revoke failed');
    } catch { setTokens(prev); setErr(t('settings.error')); }
  };

  const copy = async () => {
    if (!fresh) return;
    try { await navigator.clipboard.writeText(fresh); setCopied(true); } catch { /* selection still works */ }
  };

  return (
    <div>
      <div className={s.head}>
        <Plug size={15} className={s.icon} />
        <div className={s.title}>{t('settings.mcpTitle')}</div>
      </div>
      <div className={s.desc}>{t('settings.mcpDesc')}</div>

      {tokens.length === 0 ? (
        <div className={s.empty}>{t('settings.mcpEmpty')}</div>
      ) : (
        tokens.map((row) => (
          <div key={row.id} className={s.row}>
            <div className={s.rowMain}>
              <div className={s.rowName}>{row.name}</div>
              <div className={s.rowMeta}>
                {row.tokenPrefix}… ·{' '}
                {row.lastUsedAt
                  ? t('settings.mcpLastUsed', { date: new Date(row.lastUsedAt).toLocaleString() })
                  : t('settings.mcpNeverUsed')}
              </div>
            </div>
            <button className="btn btn-ghost btn-icon" title={t('settings.mcpRevoke')} onClick={() => revoke(row)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}

      <div className={s.createRow}>
        <input
          className={`field ${s.createInput}`}
          value={name}
          placeholder={t('settings.mcpNamePlaceholder')}
          onChange={(e) => { setName(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
        />
        <button className="btn btn-primary" onClick={create} disabled={busy}>
          {busy ? <Loader2 size={13} /> : <Plug size={13} />} {t('settings.mcpCreate')}
        </button>
      </div>

      {fresh && (
        <div className={s.fresh}>
          <div className={s.freshLabel}>{t('settings.mcpCreated')}</div>
          <code className={s.freshToken}>{fresh}</code>
          <button className="btn btn-sm" onClick={copy} style={{ marginTop: 8 }}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? t('settings.mcpCopied') : t('settings.mcpCopy')}
          </button>
          <div className={s.freshHint}>{t('settings.mcpConnectHint')}</div>
        </div>
      )}

      {err && <div className={s.err} role="alert">{err}</div>}
    </div>
  );
}
