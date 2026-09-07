'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, ShieldAlert, Cpu, MonitorPlay, Lock } from 'lucide-react';
import type { ServerView, ActiveServerSession } from '../../lib/types';
import RdpClient, { type Phase } from './RdpClient';
import s from './page.module.css';

const STYLES = `
@keyframes sess-ring { 0% { transform: scale(.62); opacity:.6; } 100% { transform: scale(2.3); opacity:0; } }
@keyframes sess-pulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }
@keyframes sess-spin { to { transform: rotate(360deg); } }
.sess-ring { position:absolute; inset:0; border-radius:50%; border:1px solid color-mix(in oklab, var(--accent) 60%, transparent); animation: sess-ring 2.8s cubic-bezier(.16,1,.3,1) infinite; }
.sess-pulse { animation: sess-pulse 2.2s ease-in-out infinite; }
.spin { animation: sess-spin 1s linear infinite; }
@media (prefers-reduced-motion: reduce) { .sess-ring, .sess-pulse, .spin { animation: none; } }
`;

interface ConnectInfo {
  gatewayUrl: string;
  token: string;
  sessionId: string;
  destination: string;
  username: string;
  domain: string | null;
  hasStoredPassword: boolean;
  password: string; // decrypted server-side for the authorized caller; '' when none stored
}

// Pre-connect → token mint → live IronRDP session host. The WASM canvas + toolbar
// live in <RdpClient>; this page owns access-check, the connect handshake, the
// not-injected password prompt, and the gateway-pending fallback. Credentials that
// are stored on the server never reach the browser — the gateway injects them.
type Stage = 'loading' | 'idle' | 'needPassword' | 'connecting' | 'live' | 'gatewayPending' | 'denied' | 'error';

export default function ServerSessionPage() {
  const t = useTranslations('servers');
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [server, setServer] = useState<ServerView | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [conn, setConn] = useState<ConnectInfo | null>(null);
  const [password, setPassword] = useState('');
  const [livePhase, setLivePhase] = useState<Phase>('init');
  // Guards against racing reconnects: rapid scale/HD changes fire several /connect requests, and
  // whichever RESPONSE lands last used to win — so the session could end up at an older scale
  // while the UI showed the newest one (this is what made the on-screen scale label lie).
  const connectSeq = useRef(0);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/servers/${id}`);
        if (!alive) return;
        if (res.status === 403 || res.status === 404) return setStage('denied');
        if (!res.ok) return setStage('error');
        setServer(await res.json());
        setStage('idle');
      } catch {
        if (alive) setStage('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const doConnect = useCallback(async () => {
    if (!id) return;
    const seq = ++connectSeq.current; // only the newest connect may apply its result
    setStage('connecting');
    try {
      const res = await fetch(`/api/servers/${id}/connect`, { method: 'POST' });
      if (seq !== connectSeq.current) return; // superseded by a newer connect — drop this response
      if (res.status === 403 || res.status === 404) return setStage('denied');
      if (res.status === 503) return setStage('gatewayPending');
      if (!res.ok) return setStage('error');
      const info = await res.json();
      if (seq !== connectSeq.current) return;
      setConn(info);
      setStage('live');
    } catch {
      if (seq === connectSeq.current) setStage('error');
    }
  }, [id]);

  // Connect entry: re-check live occupancy (so the warning is accurate at click time),
  // warn if someone else is already connected (RDP bumps the prior session for the same
  // account), then prompt for a password when none is stored, else connect.
  const onConnectClick = useCallback(async () => {
    let others: ActiveServerSession[] = (server?.activeSessions ?? []).filter((s) => !s.isSelf);
    try {
      const res = await fetch(`/api/servers/${id}`);
      if (res.ok) {
        const fresh: ServerView = await res.json();
        setServer(fresh);
        others = (fresh.activeSessions ?? []).filter((s) => !s.isSelf);
      }
    } catch {
      /* use last-known occupancy */
    }
    if (others.length > 0) {
      const name = others[0].name?.trim() || t('someone');
      if (!window.confirm(t('inUseConfirm', { name }))) return;
    }
    if (server && !server.hasSecret) {
      setStage('needPassword');
      return;
    }
    void doConnect();
  }, [server, doConnect, id, t]);

  const statusPill = (() => {
    if (stage === 'live') {
      if (livePhase === 'connected') return { label: t('connected'), color: 'var(--success)' };
      if (livePhase === 'error') return { label: t('connectFailed'), color: 'var(--danger-fg)' };
      if (livePhase === 'closed') return { label: t('sessionEnded'), color: 'var(--muted)' };
      return { label: t('connecting'), color: 'var(--accent)' };
    }
    if (stage === 'connecting') return { label: t('connecting'), color: 'var(--accent)' };
    if (stage === 'denied') return { label: t('accessDeniedTitle'), color: 'var(--danger-fg)' };
    if (stage === 'error') return { label: t('sessionError'), color: 'var(--danger-fg)' };
    return { label: 'RDP', color: 'var(--accent)' };
  })();

  return (
    <div className={s.page}>
      <div className={s.container}>
        <style>{STYLES}</style>

        {/* header */}
        <div className={s.headerRow}>
          <Link href="/servers" className={`btn btn-ghost ${s.backLink}`} aria-label={t('back')}>
            <ArrowLeft size={18} />
          </Link>
          <div className={s.titleWrap}>
            <h1 className={s.title}>
              {server ? server.name : t('session')}
            </h1>
            {/* address/login subtitle — admins only; the member view omits host/username */}
            {server?.host && (
              <div className={s.subtitle}>
                {server.domain ? `${server.domain}\\${server.username}` : server.username}
                <span className={s.atSign}> @ </span>
                {server.host}:{server.port}
              </div>
            )}
          </div>
          <span className={s.statusPill}>
            <span className={`sess-pulse ${s.statusDot}`} style={{ background: statusPill.color }} />
            {statusPill.label}
          </span>
        </div>

        {/* live session — IronRDP / Devolutions Gateway */}
        {stage === 'live' && conn && server && (
          <RdpClient
            key={conn.sessionId}
            connectionId={id!}
            gatewayUrl={conn.gatewayUrl}
            token={conn.token}
            destination={conn.destination}
            sessionId={conn.sessionId}
            serverName={server.name}
            username={conn.username}
            domain={conn.domain}
            password={conn.hasStoredPassword ? conn.password : password}
            onPhase={setLivePhase}
            onRequestReconnect={() => void doConnect()}
            onExit={() => {
              setConn(null);
              setPassword('');
              setLivePhase('init');
              setStage('idle');
            }}
          />
        )}

        {/* everything else renders inside the faux window frame */}
        {stage !== 'live' && (
          <div className={s.windowFrame} style={{ background: '#0a0d12', boxShadow: '0 24px 70px -30px rgba(0,0,0,.7)' }}>
            <div className={s.titlebar} style={{ borderBottom: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.02)' }}>
              <div className={s.dots}>
                <span className={s.dot} style={{ background: '#ff5f57' }} />
                <span className={s.dot} style={{ background: '#febc2e' }} />
                <span className={s.dot} style={{ background: '#28c840' }} />
              </div>
            </div>

            <div className={s.stageArea}>
              {(stage === 'loading' || stage === 'connecting') && (
                <div className={s.loadingRow}>
                  <Loader2 size={18} className="spin" /> {t('connecting')}
                </div>
              )}

              {stage === 'denied' && (
                <div className={s.deniedBox}>
                  <ShieldAlert size={36} className={s.deniedIcon} />
                  <div className={s.deniedTitle}>{t('accessDeniedTitle')}</div>
                  <div className={s.deniedBody}>{t('accessDeniedBody')}</div>
                  <Link href="/servers" className={`btn ${s.deniedBack}`}>{t('back')}</Link>
                </div>
              )}

              {stage === 'error' && <div className={s.errorText}>{t('sessionError')}</div>}

              {stage === 'idle' && server && (
                <div className={s.idleBox} style={{ color: 'rgba(231,233,238,.7)' }}>
                  <div className={s.ringWrap}>
                    <span className="sess-ring" />
                    <span className={`sess-ring ${s.ringDelay}`} />
                    <span className={s.iconCircle} style={{ background: 'color-mix(in oklab, var(--accent) 18%, #0a0d12)' }}>
                      <MonitorPlay size={26} />
                    </span>
                  </div>
                  <div className={s.readyTitle}>{t('readyTitle')}</div>
                  <div className={s.readyBody}>{t('readyBody')}</div>
                  {(() => {
                    const others = (server.activeSessions ?? []).filter((s) => !s.isSelf);
                    if (others.length === 0) return null;
                    const name = others[0].name?.trim() || t('someone');
                    const extra = others.length - 1;
                    const label = extra > 0 ? `${t('inUseBy', { name })} +${extra}` : t('inUseBy', { name });
                    return (
                      <div className={s.inUseBadge}>
                        <span className={`sess-pulse ${s.inUseDot}`} />
                        {label}
                      </div>
                    );
                  })()}
                  <div>
                    <button className={`btn btn-primary ${s.mt16}`} onClick={() => void onConnectClick()}>
                      <MonitorPlay size={16} className={s.iconMr7} /> {t('connect')}
                    </button>
                  </div>
                </div>
              )}

              {stage === 'needPassword' && server && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (password) void doConnect();
                  }}
                  className={s.passwordForm}
                >
                  <div className={s.lockRow}>
                    <Lock size={22} />
                  </div>
                  <div className={s.passwordTitle}>{t('passwordPromptTitle')}</div>
                  <div className={s.passwordBody}>
                    {t('passwordPromptBody', {
                      user: server.username
                        ? (server.domain ? `${server.domain}\\${server.username}` : server.username)
                        : server.name,
                    })}
                  </div>
                  <input
                    type="password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('password')}
                    className={`field ${s.passwordInput}`}
                  />
                  <div className={s.passwordActions}>
                    <button type="button" className={`btn btn-ghost ${s.flex1}`} onClick={() => { setPassword(''); setStage('idle'); }}>
                      {t('cancel')}
                    </button>
                    <button type="submit" className={`btn btn-primary ${s.flex1}`} disabled={!password}>
                      {t('connect')}
                    </button>
                  </div>
                </form>
              )}

              {stage === 'gatewayPending' && (
                <div className={s.gatewayBox} style={{ color: 'rgba(231,233,238,.7)' }}>
                  <div className={s.ringWrap}>
                    <span className="sess-ring" />
                    <span className={`sess-ring ${s.ringDelay}`} />
                    <span className={s.iconCircle} style={{ background: 'color-mix(in oklab, var(--accent) 18%, #0a0d12)' }}>
                      <Cpu size={26} />
                    </span>
                  </div>
                  <div className={s.readyTitle}>{t('gatewayPendingTitle')}</div>
                  <div className={s.readyBody}>{t('gatewayPendingBody')}</div>
                  <div className={s.gatewayPill} style={{ color: 'rgba(231,233,238,.85)', background: 'rgba(255,255,255,.03)' }}>
                    <span className={`sess-pulse ${s.gatewayDot}`} />
                    IronRDP · Devolutions Gateway
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
