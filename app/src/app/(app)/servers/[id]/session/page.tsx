'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, ShieldAlert, Cpu, Maximize2, ClipboardCopy, FolderUp, Power } from 'lucide-react';
import type { ServerView } from '../../lib/types';

const STYLES = `
@keyframes sess-ring { 0% { transform: scale(.62); opacity:.6; } 100% { transform: scale(2.3); opacity:0; } }
@keyframes sess-pulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }
@keyframes sess-spin { to { transform: rotate(360deg); } }
.sess-ring { position:absolute; inset:0; border-radius:50%; border:1px solid color-mix(in oklab, var(--accent) 60%, transparent); animation: sess-ring 2.8s cubic-bezier(.16,1,.3,1) infinite; }
.sess-pulse { animation: sess-pulse 2.2s ease-in-out infinite; }
.spin { animation: sess-spin 1s linear infinite; }
.sess-tool { display:inline-flex; align-items:center; justify-content:center; width:30px; height:26px; border-radius:7px; color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .sess-ring, .sess-pulse, .spin { animation: none; } }
`;

// Live RDP session host. The IronRDP WASM canvas + real toolbar mount inside this
// frame once the garely-rdp-gw sidecar lands (§15.10 steps 2-4). Until then it
// confirms access + shows the target; credentials never reach the client.
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

  const statusPill = (() => {
    if (state === 'loading') return { label: t('connecting'), color: 'var(--accent)' };
    if (state === 'denied') return { label: t('accessDeniedTitle'), color: '#f87171' };
    if (state === 'error') return { label: t('sessionError'), color: '#f87171' };
    return { label: 'RDP', color: 'var(--accent)' };
  })();

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 4px' }}>
      <style>{STYLES}</style>

      {/* Top control row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Link href="/servers" className="btn btn-ghost" style={{ padding: 8, textDecoration: 'none' }} aria-label={t('back')}>
          <ArrowLeft size={18} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 640, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {server ? server.name : t('session')}
          </h1>
          {server && (
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
              {server.domain ? `${server.domain}\\${server.username}` : server.username}
              <span style={{ opacity: 0.5 }}> @ </span>{server.host}:{server.port}
            </div>
          )}
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, fontWeight: 600 }}>
          <span className="sess-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: statusPill.color }} />
          {statusPill.label}
        </span>
      </div>

      {/* Session frame — faux window chrome + body */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', background: '#0a0d12', boxShadow: '0 24px 70px -30px rgba(0,0,0,.7)' }}>
        {/* chrome toolbar (the real IronRDP controls replace this with the gateway) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.02)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
          </div>
          <div style={{ flex: 1 }} />
          {/* affordances that become live with the WASM client */}
          <span className="sess-tool" title="Clipboard"><ClipboardCopy size={15} /></span>
          <span className="sess-tool" title="File transfer"><FolderUp size={15} /></span>
          <span className="sess-tool" title="Fullscreen"><Maximize2 size={15} /></span>
          <span className="sess-tool" title="Disconnect" style={{ color: '#f87171' }}><Power size={15} /></span>
        </div>

        {/* body */}
        <div style={{ minHeight: 'min(72vh, 720px)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 32 }}>
          {state === 'loading' && (
            <div style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Loader2 size={18} className="spin" /> {t('connecting')}
            </div>
          )}

          {state === 'denied' && (
            <div style={{ color: 'var(--muted)', maxWidth: 380 }}>
              <ShieldAlert size={36} style={{ color: '#f87171', marginBottom: 12 }} />
              <div style={{ fontSize: 17, fontWeight: 640, color: '#e7e9ee' }}>{t('accessDeniedTitle')}</div>
              <div style={{ fontSize: 14, marginTop: 8 }}>{t('accessDeniedBody')}</div>
              <Link href="/servers" className="btn" style={{ marginTop: 18, textDecoration: 'none' }}>{t('back')}</Link>
            </div>
          )}

          {state === 'error' && <div style={{ color: 'var(--muted)' }}>{t('sessionError')}</div>}

          {state === 'ok' && (
            <div style={{ color: 'rgba(231,233,238,.7)', maxWidth: 480 }}>
              {/* concentric pulse rings around the engine icon */}
              <div style={{ position: 'relative', width: 92, height: 92, margin: '0 auto 20px' }}>
                <span className="sess-ring" />
                <span className="sess-ring" style={{ animationDelay: '1.4s' }} />
                <span style={{ position: 'absolute', inset: 16, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in oklab, var(--accent) 18%, #0a0d12)', color: 'var(--accent)', border: '1px solid color-mix(in oklab, var(--accent) 40%, transparent)' }}>
                  <Cpu size={26} />
                </span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 650, color: '#e7e9ee', letterSpacing: '-0.01em' }}>{t('gatewayPendingTitle')}</div>
              <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.55 }}>{t('gatewayPendingBody')}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: 12, color: 'rgba(231,233,238,.85)', padding: '7px 13px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.03)', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} className="sess-pulse" />
                IronRDP · Devolutions Gateway
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
