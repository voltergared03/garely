import { describe, it, expect } from 'vitest';
import { rateLimit, rateLimitReset } from '@/lib/rate-limit';

// No REDIS_URL in the test env → exercises the in-process fallback (which is
// also the production backend on a single-container deploy).
describe('rateLimit (in-process fallback)', () => {
  it('allows up to max, then blocks within the window', async () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect((await rateLimit(key, 3, 60_000)).ok).toBe(true);
    }
    const blocked = await rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('uses independent counters per key', async () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect((await rateLimit(a, 1, 60_000)).ok).toBe(true);
    expect((await rateLimit(a, 1, 60_000)).ok).toBe(false);
    expect((await rateLimit(b, 1, 60_000)).ok).toBe(true);
  });

  it('reset clears the counter', async () => {
    const key = `t-${Math.random()}`;
    await rateLimit(key, 1, 60_000);
    expect((await rateLimit(key, 1, 60_000)).ok).toBe(false);
    await rateLimitReset(key);
    expect((await rateLimit(key, 1, 60_000)).ok).toBe(true);
  });
});
