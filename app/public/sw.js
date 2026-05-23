/* EAM Meet — service worker.
 * Conservative caching (this is a live-video app, so room/lobby/api are never
 * cached) + Web Push notification handling. Bump VERSION to force an update. */

const VERSION = 'v1';
const STATIC_CACHE = `eam-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE).catch(() => {});
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Paths that must always hit the network (auth, realtime, dynamic API).
function isNeverCache(pathname) {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/room/') ||
    pathname.startsWith('/lobby/') ||
    pathname.startsWith('/join/') ||
    pathname.startsWith('/2fa') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup')
  );
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/favicon.svg' ||
    /\.(?:js|css|woff2?|png|jpe?g|svg|webp|ico|gif)$/.test(pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Leave cross-origin (LiveKit, egress, Google, etc.) entirely alone.
  if (url.origin !== self.location.origin) return;
  if (isNeverCache(url.pathname)) return;

  // Page navigations: network-first, fall back to the offline page when down.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return offline || Response.error();
        }
      })()
    );
    return;
  }

  // Hashed static assets: stale-while-revalidate.
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
  }
  // Anything else: default browser handling (network).
});

/* ── Web Push ─────────────────────────────────────────────── */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data && event.data.text ? event.data.text() : 'EAM Meet' };
  }

  const title = data.title || 'EAM Meet';
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
        /* will be re-established next time the app loads */
      }
    })()
  );
});
