'use client';

import { useEffect, useState } from 'react';
import { BellRing, BellOff, Loader2 } from 'lucide-react';
import {
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  showTestNotification,
  type PushState,
} from '@/lib/push-client';

/**
 * Device-specific push opt-in. Unlike the email toggles (server prefs), this
 * drives the browser Notification permission + the SW push subscription, so it
 * must run client-side and reflects only THIS device.
 */
export function PushToggle() {
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  const enabled = state === 'subscribed';
  const supported = state !== 'unsupported' && state !== 'loading';
  const denied = state === 'denied';
  // `supported` is already false while loading, so !supported covers that case.
  const locked = !supported || denied || busy;

  const toggle = async () => {
    if (locked) return;
    setBusy(true);
    try {
      if (enabled) {
        await unsubscribeFromPush();
        setState('unsubscribed');
      } else {
        const r = await subscribeToPush();
        if (r.ok) {
          setState('subscribed');
          void showTestNotification();
        } else if (r.error === 'denied') {
          setState('denied');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  let hint =
    'Отримуйте сповіщення про мітинги та завдання навіть коли застосунок закрито.';
  if (state === 'unsupported') hint = 'Цей браузер не підтримує push-сповіщення.';
  else if (denied)
    hint =
      'Сповіщення заблоковано в налаштуваннях браузера — дозвольте їх вручну, щоб увімкнути.';
  else if (enabled) hint = 'Увімкнено на цьому пристрої.';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '12px 0',
        gap: 14,
        borderBottom: '1px solid var(--border)',
        opacity: state === 'loading' ? 0.6 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            color: 'var(--text-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontWeight: 500,
          }}
        >
          {enabled ? (
            <BellRing size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          ) : (
            <BellOff size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          )}
          Push-сповіщення на цьому пристрої
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, lineHeight: 1.45 }}>
          {hint}
        </div>
        {enabled && (
          <button
            className="btn btn-sm"
            style={{ marginTop: 9, fontSize: 12 }}
            onClick={() => void showTestNotification()}
          >
            Надіслати тест
          </button>
        )}
      </div>

      <button
        type="button"
        aria-label="Push-сповіщення"
        disabled={locked}
        onClick={toggle}
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          border: 'none',
          flexShrink: 0,
          marginTop: 1,
          background: enabled ? 'var(--accent)' : 'var(--surface-3)',
          position: 'relative',
          cursor: locked ? 'not-allowed' : 'pointer',
          opacity: !supported || denied ? 0.5 : 1,
          transition: 'background 0.15s',
        }}
      >
        {busy ? (
          <Loader2
            size={12}
            className="spin"
            style={{ position: 'absolute', top: 5, left: 13, color: '#fff' }}
          />
        ) : (
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: enabled ? 19 : 3,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s',
              boxShadow: '0 1px 3px rgba(0,0,0,.3)',
            }}
          />
        )}
      </button>
    </div>
  );
}
