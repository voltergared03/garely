'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';
import {
  getInstallPrompt,
  triggerInstall,
  subscribeInstall,
  isStandalone,
  isIOS,
} from '@/lib/pwa-install';

const DISMISS_KEY = 'eam_install_card_dismissed';

/**
 * Dismissible dashboard card that offers to install the PWA. Uses the native
 * `beforeinstallprompt` on Chromium; on iOS Safari (no such event) it expands
 * "Add to Home Screen" instructions instead. Renders null when already
 * installed, unsupported, or dismissed.
 */
export function InstallAppCard() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  // bump to re-read the (module-level) captured prompt when it arrives
  const [, force] = useState(0);

  useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIOS());
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
    setReady(true);
    return subscribeInstall(() => force((n) => n + 1));
  }, []);

  if (!ready) return null;

  const nativePrompt = getInstallPrompt();
  const show = !dismissed && !standalone && (!!nativePrompt || ios);
  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const onInstall = async () => {
    if (nativePrompt) {
      const outcome = await triggerInstall();
      if (outcome === 'accepted') setStandalone(true);
    } else if (ios) {
      setShowIOSHelp((v) => !v);
    }
  };

  return (
    <div
      className="card fade-in"
      style={{
        padding: '16px 20px',
        marginBottom: 22,
        background:
          'linear-gradient(135deg, color-mix(in oklab, var(--accent) 12%, var(--surface)) 0%, var(--surface) 70%)',
        borderColor: 'color-mix(in oklab, var(--accent) 26%, var(--border))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            flexShrink: 0,
            background: 'color-mix(in oklab, var(--accent) 18%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Download size={19} style={{ color: 'var(--accent)' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>Встановити застосунок</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.4 }}>
            Швидкий доступ з головного екрана + push-сповіщення, навіть коли вкладку закрито
          </div>
        </div>

        <button
          className="btn btn-primary btn-sm"
          onClick={onInstall}
          style={{ fontWeight: 600, flexShrink: 0, gap: 6 }}
        >
          <Download size={14} />
          {nativePrompt ? 'Встановити' : 'Як встановити'}
        </button>
        <button
          className="btn btn-ghost btn-icon"
          title="Сховати"
          onClick={dismiss}
          style={{ height: 28, width: 28, flexShrink: 0 }}
        >
          <X size={14} />
        </button>
      </div>

      {showIOSHelp && ios && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gap: 10,
            fontSize: 12.5,
            color: 'var(--text-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Share size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span>
              1. Натисніть кнопку <b>«Поділитися»</b> у Safari
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Plus size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span>
              2. Оберіть <b>«На початковий екран»</b> (Add to Home Screen)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
