import Redis from 'ioredis';
import { logger } from './logger';

// Shared Redis client, created lazily from REDIS_URL. Returns null when
// REDIS_URL is unset (callers then use their in-process fallback). Configured
// to fail FAST and never queue offline, so a Redis outage degrades gracefully
// instead of hanging a request path.
let client: Redis | null | undefined;
let warned = false;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    client = null;
    return client;
  }
  try {
    const c = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1500,
      commandTimeout: 800,
    });
    // Swallow connection errors (throttled) so an outage can't crash the
    // process via an unhandled 'error' event; commands fall back per-call.
    c.on('error', (e: Error) => {
      if (!warned) {
        warned = true;
        logger.warn('redis_unavailable', { message: e?.message });
        setTimeout(() => {
          warned = false;
        }, 60_000);
      }
    });
    client = c;
  } catch (e) {
    logger.warn('redis_init_failed', { message: e instanceof Error ? e.message : String(e) });
    client = null;
  }
  return client;
}
