import { getRedis } from './redis';
import { logger } from './logger';

export type RateLimitResult = { ok: boolean; retryAfter: number };

// In-process fixed-window fallback — the only backend when REDIS_URL is unset,
// and the safety net whenever a Redis command fails.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function memLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > max) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

// Atomic: INCR then PEXPIRE on the first hit only (so the window is fixed).
const INCR_EXPIRE =
  "local c = redis.call('INCR', KEYS[1]) if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end return c";

/**
 * Fixed-window rate limit. Uses Redis when REDIS_URL is configured (shared
 * across instances); otherwise an in-process Map (sufficient for a single
 * container). ANY Redis error transparently falls back to the in-process
 * limiter, so a Redis hiccup can never block requests.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return memLimit(key, max, windowMs);
  try {
    const k = `rl:${key}`;
    const count = Number(await redis.eval(INCR_EXPIRE, 1, k, String(windowMs)));
    if (count > max) {
      const ttl = await redis.pttl(k);
      return { ok: false, retryAfter: ttl > 0 ? Math.ceil(ttl / 1000) : Math.ceil(windowMs / 1000) };
    }
    return { ok: true, retryAfter: 0 };
  } catch (e) {
    logger.warn('ratelimit_redis_fallback', { message: e instanceof Error ? e.message : String(e) });
    return memLimit(key, max, windowMs);
  }
}

/** Clear a key (e.g. after a successful verification). */
export async function rateLimitReset(key: string): Promise<void> {
  buckets.delete(key);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(`rl:${key}`);
    } catch {
      /* ignore — best effort */
    }
  }
}
