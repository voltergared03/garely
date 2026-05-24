/**
 * Browser-side Web Push helpers. Used by the settings toggle / notification
 * prompt to request permission, subscribe via the SW push manager, and sync the
 * subscription with the server.
 */

export type PushState =
  | 'unsupported' // no SW / PushManager / Notification API
  | 'denied' // user blocked notifications
  | 'default' // not yet asked
  | 'unsubscribed' // permission granted but no active subscription
  | 'subscribed'; // active subscription on this device

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) return 'subscribed';
  } catch {
    /* ignore */
  }
  return Notification.permission === 'granted' ? 'unsubscribed' : 'default';
}

export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: 'unsupported' };

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return { ok: false, error: 'denied' };

  try {
    const reg = await navigator.serviceWorker.ready;

    const keyRes = await fetch('/api/push/public-key');
    if (!keyRes.ok) return { ok: false, error: 'no-key' };
    const { publicKey } = await keyRes.json();
    if (!publicKey) return { ok: false, error: 'no-key' };

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    if (!saveRes.ok) return { ok: false, error: 'save-failed' };

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'subscribe-failed' };
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean }> {
  if (!isPushSupported()) return { ok: false };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  return { ok: true };
}

export type TestResult =
  | { ok: true; via: 'sw' | 'direct' }
  | { ok: false; reason: 'unsupported' | 'denied' | 'error'; detail?: string };

/**
 * Fire a LOCAL test notification. Prefers the SW (`registration.showNotification`,
 * works everywhere) but falls back to a direct `Notification` if the SW isn't
 * ready within a short window — so it never silently hangs. A success here means
 * the browser accepted it; if the user still sees nothing, the OS is suppressing
 * it (notifications disabled for the browser, or Do-Not-Disturb / Focus).
 */
export async function showTestNotification(): Promise<TestResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  let perm = Notification.permission;
  if (perm === 'default') {
    try {
      perm = await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
  if (perm !== 'granted') return { ok: false, reason: 'denied' };

  const body = 'Тестове сповіщення ✓';
  const opts: NotificationOptions & { badge?: string } = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: 'eam-test',
  };

  try {
    if ('serviceWorker' in navigator) {
      // Don't wait forever for an active SW.
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]);
      if (reg) {
        await (reg as ServiceWorkerRegistration).showNotification('EZmeet', opts);
        return { ok: true, via: 'sw' };
      }
    }
    // Fallback for desktop browsers without a ready SW.
    new Notification('EZmeet', { body, icon: '/icons/icon-192.png' });
    return { ok: true, via: 'direct' };
  } catch (e: any) {
    return { ok: false, reason: 'error', detail: e?.message };
  }
}

/**
 * Ask the SERVER to push to this user's devices — validates the full pipeline
 * (VAPID → push service → SW). Returns how many subscriptions were reached.
 */
export async function sendServerTest(): Promise<{ sent: number; error?: string }> {
  try {
    const res = await fetch('/api/push/test', { method: 'POST' });
    if (!res.ok) return { sent: 0, error: 'request-failed' };
    const d = await res.json().catch(() => ({}));
    return { sent: d.sent ?? 0 };
  } catch {
    return { sent: 0, error: 'network' };
  }
}
