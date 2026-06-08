'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Loader2,
  Maximize2,
  Minimize2,
  ClipboardCheck,
  ClipboardX,
  Power,
  Keyboard,
  ScanLine,
  Square,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

/* ─── Minimal structural types for the dynamically-imported IronRDP API ───────
 * The real types live in @devolutions/iron-remote-desktop(.rdp), but those modules
 * register a custom element + init WASM at import time, so they may ONLY be loaded
 * in the browser (a server import crashes on `customElements`). We therefore import
 * them lazily inside an effect and describe just the surface we touch here. */
interface ConfigBuilderLike {
  withUsername(v: string): ConfigBuilderLike;
  withPassword(v: string): ConfigBuilderLike;
  withDestination(v: string): ConfigBuilderLike;
  withProxyAddress(v: string): ConfigBuilderLike;
  withServerDomain(v: string): ConfigBuilderLike;
  withAuthToken(v: string): ConfigBuilderLike;
  withDesktopSize(v: { width: number; height: number }): ConfigBuilderLike;
  withExtension(v: unknown): ConfigBuilderLike;
  build(): unknown;
}
interface UserInteractionLike {
  configBuilder(): ConfigBuilderLike;
  connect(config: unknown): Promise<{ run(): Promise<{ reason(): string }> }>;
  setVisibility(v: boolean): void;
  setScale(scale: number): void;
  ctrlAltDel(): void;
  metaKey(): void;
  shutdown(): void;
  setEnableClipboard(v: boolean): void;
  setEnableAutoClipboard?(v: boolean): void;
}
type IronElement = HTMLElement & {
  module: unknown;
  scale: string;
  verbose: boolean;
  flexcenter: boolean;
};

// ScreenScale numeric values (from the reference svelte client: Fit=1, Full=2, Real=3).
const SCALE = { FIT: 1, FULL: 2, REAL: 3 } as const;

// init() is global to the WASM module — run it at most once per page load.
let _initPromise: Promise<void> | null = null;

const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

type Phase = 'init' | 'connecting' | 'connected' | 'closed' | 'error';

export interface RdpClientProps {
  connectionId: string;
  gatewayUrl: string;
  token: string;
  destination: string; // host:port
  sessionId: string;
  serverName: string;
  username: string;
  domain: string | null;
  injected: boolean;
  /** Empty when injected; the user-supplied password when the gateway is not injecting. */
  password: string;
  /** Back to the pre-connect screen (user disconnected or the session ended). */
  onExit: () => void;
}

export default function RdpClient(props: RdpClientProps) {
  const t = useTranslations('servers');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const uiRef = useRef<UserInteractionLike | null>(null);
  const elRef = useRef<IronElement | null>(null);
  const exitedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('init');
  const [errMsg, setErrMsg] = useState<string>('');
  const [fullscreen, setFullscreen] = useState(false);
  const [clipboard, setClipboard] = useState(true);

  // Close the audit session row (best-effort; the gateway will later add byte counts).
  const closeAudit = useCallback(() => {
    const body = JSON.stringify({ sessionId: props.sessionId });
    const url = `/api/servers/${props.connectionId}/disconnect`;
    // sendBeacon survives page unload; fall back to fetch+keepalive.
    if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    else void fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
  }, [props.connectionId, props.sessionId]);

  const exit = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    try {
      uiRef.current?.shutdown();
    } catch {
      /* already gone */
    }
    closeAudit();
    props.onExit();
  }, [closeAudit, props]);

  /* ─── Mount the web component + run the session lifecycle (once) ─── */
  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    (async () => {
      try {
        // Browser-only dynamic import — registers <iron-remote-desktop> + the RDP backend.
        const rdp = await import('@devolutions/iron-remote-desktop-rdp');
        await import('@devolutions/iron-remote-desktop'); // side effect: customElements.define
        if (!_initPromise) _initPromise = rdp.init('INFO');
        await _initPromise;
        if (cancelled) return;

        const el = document.createElement('iron-remote-desktop') as IronElement;
        el.module = rdp.Backend;
        el.scale = 'fit';
        el.verbose = false;
        el.flexcenter = true;
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.display = 'block';

        el.addEventListener('ready', (e) => {
          const detail = (e as CustomEvent).detail;
          const ui: UserInteractionLike = detail?.irgUserInteraction ?? detail;
          uiRef.current = ui;
          void startSession(ui, rdp);
        });

        host.appendChild(el);
        elRef.current = el;
      } catch (err) {
        if (!cancelled) {
          setErrMsg(err instanceof Error ? err.message : String(err));
          setPhase('error');
        }
      }
    })();

    async function startSession(ui: UserInteractionLike, rdp: typeof import('@devolutions/iron-remote-desktop-rdp')) {
      try {
        setPhase('connecting');
        ui.setEnableClipboard(clipboard);

        const rect = host?.getBoundingClientRect();
        const size = {
          width: Math.max(800, Math.round(rect?.width || 1280)),
          height: Math.max(600, Math.round(rect?.height || 720)),
        };
        // Empty creds when injected → the gateway supplies them from the encrypted token.
        const dstUser = props.injected
          ? ''
          : props.domain
            ? `${props.domain}\\${props.username}`
            : props.username;

        const config = ui
          .configBuilder()
          .withDestination(props.destination)
          .withProxyAddress(props.gatewayUrl)
          .withAuthToken(props.token)
          .withServerDomain(props.injected ? '' : props.domain || '')
          .withUsername(dstUser)
          .withPassword(props.injected ? '' : props.password)
          .withDesktopSize(size)
          .withExtension(rdp.displayControl(true))
          .build();

        const info = await ui.connect(config);
        if (cancelled) return;
        ui.setVisibility(true);
        try {
          ui.setEnableAutoClipboard?.(clipboard);
        } catch {
          /* older backend without auto-clipboard */
        }
        setPhase('connected');

        const term = await info.run(); // resolves when the session ends
        if (cancelled) return;
        setErrMsg(term?.reason?.() || '');
        setPhase('closed');
        closeAudit();
      } catch (err) {
        if (cancelled) return;
        setErrMsg(err instanceof Error ? err.message : String(err));
        setPhase('error');
        closeAudit();
      }
    }

    return () => {
      cancelled = true;
      try {
        uiRef.current?.shutdown();
      } catch {
        /* noop */
      }
      try {
        elRef.current?.remove();
      } catch {
        /* noop */
      }
    };
    // Connect params are fixed for the lifetime of this component instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Best-effort Mac ⌘→Ctrl layer (clipboard SYNC is the reliable path) ───
   * Copy/paste across the Mac↔remote boundary is handled by CLIPRDR clipboard
   * sync (setEnableClipboard/AutoClipboard) — the proven fix. This layer is a
   * muscle-memory nicety: when the canvas is focused, translate ⌘C/V/X/A/Z into
   * the Ctrl equivalent the remote OS expects, and stop the browser from running
   * its own ⌘C (which would hijack the selection). Reserved combos (⌘R/T/W/Q…)
   * are left to the browser. */
  useEffect(() => {
    if (!isMac()) return;
    const ALLOW = new Set(['c', 'v', 'x', 'a', 'z', 'y']);
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'connected') return;
      if (!e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (!ALLOW.has(key)) return;
      const el = elRef.current;
      const active = document.activeElement;
      if (!el || (active !== el && !el.contains(active))) return; // only when the canvas owns focus
      e.preventDefault();
      e.stopImmediatePropagation();
      const synth = new KeyboardEvent(e.type, {
        key: e.key,
        code: e.code,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      (active || el).dispatchEvent(synth);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, [phase]);

  // Re-fit when entering/leaving our own CSS fullscreen (NEVER the browser
  // Fullscreen API — that recentres the canvas and breaks pointer coordinates).
  useEffect(() => {
    const ui = uiRef.current;
    if (ui && phase === 'connected') {
      try {
        ui.setScale(SCALE.FIT);
      } catch {
        /* noop */
      }
    }
  }, [fullscreen, phase]);

  // Esc exits our fullscreen (capture phase so it doesn't reach the canvas first).
  useEffect(() => {
    if (!fullscreen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [fullscreen]);

  const toggleClipboard = () => {
    const ui = uiRef.current;
    const next = !clipboard;
    setClipboard(next);
    try {
      ui?.setEnableClipboard(next);
      ui?.setEnableAutoClipboard?.(next);
    } catch {
      /* noop */
    }
  };

  const toolBtn = (
    onClick: () => void,
    label: string,
    icon: React.ReactNode,
    opts?: { danger?: boolean; active?: boolean; disabled?: boolean },
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={opts?.disabled}
      className="rdp-tool"
      style={{
        color: opts?.danger ? '#f87171' : opts?.active ? 'var(--accent)' : 'var(--muted)',
        opacity: opts?.disabled ? 0.4 : 1,
        cursor: opts?.disabled ? 'default' : 'pointer',
      }}
    >
      {icon}
    </button>
  );

  const liveControls = phase === 'connected';

  return (
    <div
      ref={frameRef}
      style={
        fullscreen
          ? { position: 'fixed', inset: 0, zIndex: 200, background: '#05070a', display: 'flex', flexDirection: 'column' }
          : {
              border: '1px solid var(--border)',
              borderRadius: 16,
              overflow: 'hidden',
              background: '#05070a',
              boxShadow: '0 24px 70px -30px rgba(0,0,0,.7)',
              display: 'flex',
              flexDirection: 'column',
            }
      }
    >
      <style>{`
        .rdp-tool { display:inline-flex; align-items:center; justify-content:center; width:32px; height:28px; border-radius:8px; background:transparent; border:1px solid transparent; transition:background .15s ease, color .15s ease; }
        .rdp-tool:hover:not(:disabled) { background:rgba(255,255,255,.06); }
        @keyframes rdp-spin { to { transform: rotate(360deg); } }
        .rdp-spin { animation: rdp-spin 1s linear infinite; }
      `}</style>

      {/* toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,.07)',
          background: 'rgba(255,255,255,.02)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12.5,
            fontWeight: 600,
            color: '#e7e9ee',
            minWidth: 0,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: liveControls ? '#10b981' : phase === 'error' ? '#f87171' : 'var(--accent)',
              boxShadow: liveControls ? '0 0 0 3px rgba(16,185,129,.18)' : 'none',
            }}
          />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {props.serverName}
          </span>
        </span>

        <div style={{ flex: 1 }} />

        {toolBtn(() => uiRef.current?.setScale(SCALE.FIT), t('fit'), <ScanLine size={15} />, { disabled: !liveControls })}
        {toolBtn(() => uiRef.current?.setScale(SCALE.REAL), t('actualSize'), <Square size={15} />, {
          disabled: !liveControls,
        })}
        {toolBtn(toggleClipboard, t('clipboard'), clipboard ? <ClipboardCheck size={15} /> : <ClipboardX size={15} />, {
          active: clipboard,
          disabled: !liveControls,
        })}
        {toolBtn(() => uiRef.current?.ctrlAltDel(), 'Ctrl+Alt+Del', <Keyboard size={15} />, { disabled: !liveControls })}
        {toolBtn(
          () => setFullscreen((v) => !v),
          fullscreen ? t('exitFullscreen') : t('fullscreen'),
          fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />,
          { disabled: !liveControls },
        )}
        {toolBtn(exit, t('disconnect'), <Power size={15} />, { danger: true })}
      </div>

      {/* canvas host */}
      <div style={{ position: 'relative', flex: 1, minHeight: fullscreen ? 0 : 'min(72vh, 720px)' }}>
        <div ref={hostRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

        {/* overlays */}
        {(phase === 'init' || phase === 'connecting') && (
          <div style={overlayStyle}>
            <Loader2 size={20} className="rdp-spin" />
            <span style={{ marginTop: 12 }}>{phase === 'init' ? t('initializing') : t('connecting')}</span>
          </div>
        )}
        {phase === 'error' && (
          <div style={overlayStyle}>
            <AlertTriangle size={30} style={{ color: '#f87171' }} />
            <div style={{ marginTop: 12, fontSize: 16, fontWeight: 640, color: '#e7e9ee' }}>{t('connectFailed')}</div>
            {errMsg && (
              <div style={{ marginTop: 6, fontSize: 12.5, maxWidth: 460, color: 'var(--muted)', wordBreak: 'break-word' }}>
                {errMsg}
              </div>
            )}
            <button className="btn" style={{ marginTop: 18 }} onClick={exit}>
              <RefreshCw size={15} style={{ marginRight: 6 }} /> {t('reconnect')}
            </button>
          </div>
        )}
        {phase === 'closed' && (
          <div style={overlayStyle}>
            <Power size={28} style={{ color: 'var(--muted)' }} />
            <div style={{ marginTop: 12, fontSize: 16, fontWeight: 640, color: '#e7e9ee' }}>{t('sessionEnded')}</div>
            {errMsg && <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>{errMsg}</div>}
            <button className="btn" style={{ marginTop: 18 }} onClick={exit}>
              <RefreshCw size={15} style={{ marginRight: 6 }} /> {t('reconnect')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: 24,
  color: 'var(--muted)',
  background: 'rgba(5,7,10,.72)',
  backdropFilter: 'blur(2px)',
  zIndex: 5,
};
