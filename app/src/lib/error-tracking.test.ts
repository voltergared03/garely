import { describe, it, expect, vi, afterEach } from 'vitest';
import { captureException } from '@/lib/error-tracking';

afterEach(() => vi.restoreAllMocks());

describe('captureException', () => {
  it('is a no-op when SENTRY_DSN is not configured (structured logs only)', () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    captureException(new Error('boom'), { route: 'x' });
    expect(f).not.toHaveBeenCalled();
  });
});
