import crypto from 'node:crypto';
import { logger } from './logger';

// Lightweight, zero-dependency error reporter speaking the Sentry "envelope"
// HTTP protocol — works with Sentry and self-hosted GlitchTip. Enabled only
// when SENTRY_DSN is set; otherwise captureException is a no-op (errors are
// still in the structured logs). Never throws and never blocks the caller.

type Dsn = { key: string; envelopeUrl: string };
let dsn: Dsn | null | undefined;

function getDsn(): Dsn | null {
  if (dsn !== undefined) return dsn;
  const raw = process.env.SENTRY_DSN?.trim();
  if (!raw) {
    dsn = null;
    return dsn;
  }
  // {proto}://{publicKey}@{host}{/path?}/{projectId}
  const m = /^(https?):\/\/([^@]+)@(.+)\/(\d+)\/?$/.exec(raw);
  if (!m) {
    logger.warn('sentry_dsn_invalid', {});
    dsn = null;
    return dsn;
  }
  const [, proto, key, hostPath, projectId] = m;
  dsn = { key, envelopeUrl: `${proto}://${hostPath}/api/${projectId}/envelope/` };
  return dsn;
}

/** Report an error to Sentry/GlitchTip (fire-and-forget). No-op without a DSN. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  const d = getDsn();
  if (!d) return;
  const error = err instanceof Error ? err : new Error(String(err));
  const id = crypto.randomBytes(16).toString('hex');
  const event = {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    logger: 'garely',
    environment: process.env.NODE_ENV || 'production',
    server_name: process.env.HOSTNAME || undefined,
    exception: { values: [{ type: error.name || 'Error', value: error.message || String(err) }] },
    extra: { ...context, stack: error.stack },
  };
  const body =
    `${JSON.stringify({ event_id: id, sent_at: new Date().toISOString() })}\n` +
    `${JSON.stringify({ type: 'event' })}\n` +
    `${JSON.stringify(event)}`;
  void fetch(d.envelopeUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-sentry-envelope',
      'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${d.key}, sentry_client=garely/1.0`,
    },
    body,
  }).catch((e) => logger.warn('sentry_send_failed', { message: e instanceof Error ? e.message : String(e) }));
}
