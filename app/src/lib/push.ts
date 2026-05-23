/**
 * Web Push (PWA) — server side. NODE-ONLY: imports `web-push`, which uses
 * node:crypto. Never import this from middleware or any Edge-runtime module;
 * only from API route handlers / instrumentation running under Node.
 */
import webpush from 'web-push';
import { prisma } from './prisma';
import { readConfig, writeConfig, CONFIG_DEFAULTS } from './config';

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cached: VapidConfig | null = null;
let configured = false;

/**
 * Read VAPID keys from SystemConfig (env fallback). If none exist yet, generate
 * a fresh keypair and persist it so every device subscribes against a stable
 * server key. Called lazily and from instrumentation on boot.
 */
export async function getVapidConfig(): Promise<VapidConfig> {
  if (cached) return cached;

  const m = await readConfig([
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
    'WS_DOMAIN',
  ]);

  let publicKey = m.VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '';
  let privateKey = m.VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY || '';

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await writeConfig({
      VAPID_PUBLIC_KEY: publicKey,
      VAPID_PRIVATE_KEY: privateKey,
    });
  }

  const domain = m.WS_DOMAIN || CONFIG_DEFAULTS.WS_DOMAIN || '';
  const subject =
    m.VAPID_SUBJECT ||
    process.env.VAPID_SUBJECT ||
    (domain ? `mailto:admin@${domain}` : 'mailto:admin@example.com');

  cached = { publicKey, privateKey, subject };
  return cached;
}

/** Configure the web-push singleton with our VAPID details (idempotent). */
async function ensureConfigured(): Promise<VapidConfig> {
  const cfg = await getVapidConfig();
  if (!configured) {
    webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    configured = true;
  }
  return cfg;
}

/** Boot hook — generate + persist keys early so the first subscribe is instant. */
export async function ensureVapidKeys(): Promise<void> {
  try {
    await ensureConfigured();
  } catch (e) {
    console.error('[push] failed to ensure VAPID keys:', e);
  }
}

export interface PushPayload {
  title: string;
  body?: string;
  /** in-app URL to open on click */
  url?: string;
  /** notification "tag" — same tag collapses/replaces prior ones */
  tag?: string;
  type?: string;
}

/**
 * Send a push payload to every subscription of the given users. Dead endpoints
 * (404/410) are pruned automatically. Failures are swallowed per-endpoint so a
 * single bad device never blocks the rest.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return { sent: 0, pruned: 0 };

  let cfg: VapidConfig;
  try {
    cfg = await ensureConfigured();
  } catch {
    return { sent: 0, pruned: 0 };
  }
  if (!cfg.publicKey || !cfg.privateKey) return { sent: 0, pruned: 0 };

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: ids } },
  });
  if (subs.length === 0) return { sent: 0, pruned: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body || '',
    url: payload.url || '/',
    tag: payload.tag,
    type: payload.type,
  });

  const deadEndpoints: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: 'normal' }
        );
        sent++;
      } catch (err: any) {
        const code = err?.statusCode;
        // 404 gone / 410 unsubscribed → drop the endpoint
        if (code === 404 || code === 410) {
          deadEndpoints.push(s.endpoint);
        }
      }
    })
  );

  if (deadEndpoints.length > 0) {
    await prisma.pushSubscription
      .deleteMany({ where: { endpoint: { in: deadEndpoints } } })
      .catch(() => {});
  }

  // Best-effort "lastUsed" bump for live endpoints.
  const liveEndpoints = subs
    .map((s) => s.endpoint)
    .filter((e) => !deadEndpoints.includes(e));
  if (liveEndpoints.length > 0) {
    await prisma.pushSubscription
      .updateMany({
        where: { endpoint: { in: liveEndpoints } },
        data: { lastUsed: new Date() },
      })
      .catch(() => {});
  }

  return { sent, pruned: deadEndpoints.length };
}
