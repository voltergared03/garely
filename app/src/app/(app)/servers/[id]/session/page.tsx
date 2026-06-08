'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, MonitorPlay, Loader2, ShieldAlert, Cpu } from 'lucide-react';
import type { ServerView } from '../../lib/types';

// Live RDP session host. The IronRDP WASM canvas + toolbar (fullscreen, clipboard,
// file panel) mount here once the `garely-rdp-gw` sidecar lands (§15.10 steps 2–4).
// Until then this confirms access + shows the target; no credentials ever reach the client.
export default function ServerSessionPage() {
  const t = useTranslations('servers');
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [server, setServer] = useState<ServerView | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/servers/${id}`);
        if (!alive) return;
        if (res.status === 403 || res.status === 404) { setState('denied'); return; }
        if (!res.ok) { setState('error'); return; }
        setServer(await res.json());
        setState('ok');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [id]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Link href="/servers" className="btn btn-ghost" style={{ padding: 8, textDecoration: 'none' }} aria-label={t('back')}>
          <ArrowLeft size={18} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {server ? server.name : t('session')}
          </h1>
          {server && (
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
              {server.domain ? `${server.domain}\\${server.username}` : server.username}@{server.host}:{server.port}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          border: '1px solid var(--border)', borderRadius: 16, background: '#0b0e13',
          minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 28,
        }}
      >
        {state === 'loading' && (
          <div style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Loader2 size={18} className="spin" /> {t('connecting')}
          </div>
        )}
        {state === 'denied' && (
          <div style={{ color: 'var(--muted)', maxWidth: 380 }}>
            <ShieldAlert size={34} style={{ color: '#f87171', marginBottom: 10 }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{t('accessDeniedTitle')}</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>{t('accessDeniedBody')}</div>
            <Link href="/servers" className="btn" style={{ marginTop: 16, textDecoration: 'none' }}>{t('back')}</Link>
          </div>
        )}
        {state === 'error' && (
          <div style={{ color: 'var(--muted)' }}>{t('sessionError')}</div>
        )}
        {state === 'ok' && (
          <div style={{ color: 'var(--muted)', maxWidth: 460 }}>
            <span style={{ display: 'inline-flex', width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', background: 'color-mix(in oklab, var(--accent) 16%, transparent)', color: 'var(--accent)', marginBottom: 14 }}>
              <Cpu size={28} />
            </span>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{t('gatewayPendingTitle')}</div>
            <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{t('gatewayPendingBody')}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 16, fontSize: 12.5, color: 'var(--text-2)', padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <MonitorPlay size={14} style={{ color: 'var(--accent)' }} /> IronRDP + Devolutions Gateway
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
