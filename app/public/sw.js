/* EZmeet — service worker.
 *
 * Push-only by design. This is a real-time video app, so the SW must NEVER
 * intercept navigations or cache app chunks: doing so risks serving stale JS
 * across deploys (build-ID mismatch → pages fail to open) and triggers iOS
 * navigation quirks. We therefore register NO `fetch` handler — the network is
 * always used directly — and keep only Web Push + notification handling.
 *
 * Bump VERSION to force every device onto a fresh worker (skipWaiting +
 * clients.claim) and wipe any caches left by older versions. */

const VERSION = 'v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache from prior versions (v1 cached app chunks → could be stale).
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/* ── Web Push ─────────────────────────────────────────────── */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data && event.data.text ? event.data.text() : 'EZmeet' };
  }

  const title = data.title || 'EZmeet';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
    timestamp: Date.now(),
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientsArr) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && target) {
            try {
              await client.navigate(target);
            } catch {
              /* cross-origin or detached — ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});

// Browser rotated the push subscription → silently re-subscribe + re-register.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const appKey =
          event.oldSubscription &&
          event.oldSubscription.options &&
          event.oldSubscription.options.applicationServerKey;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appKey || undefined,
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        });
      } catch {
        /* re-established next time the app loads */
      }
    })()
  );
});
