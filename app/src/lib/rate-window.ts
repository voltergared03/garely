/**
 * Sliding-window rate limiter for an outbound API budget (ClickUp: ~100 requests per
 * minute per token, shared by EVERYTHING we do — list discovery, task pushes, deletes,
 * webhook follow-ups). Without one, a burst from one screen (a settings tab walking
 * Spaces → Folders → Lists on every mount) starves the rest and ClickUp answers 429 to
 * all of it — which is what took the list picker and task deletion down on 2026-09-07.
 *
 * Pure: the clock is injectable, so the arithmetic is unit-testable without timers.
 */
export class RateWindow {
  private stamps: number[] = [];
  private readonly limit: number;

  constructor(
    limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    // A limit below 1 would make delay() read stamps[0] of an empty window → NaN, and
    // acquire() would spin forever without ever issuing a request. Infinity survives.
    this.limit = Math.max(1, Math.floor(limit) || 1);
  }

  /** Milliseconds until a slot frees up; 0 when one is free right now. */
  delay(): number {
    this.prune();
    if (this.stamps.length < this.limit) return 0;
    return Math.max(0, this.stamps[0] + this.windowMs - this.now());
  }

  /** Record one call. Callers check delay() first; take() never blocks. */
  take(): void {
    this.prune();
    this.stamps.push(this.now());
  }

  /** How many calls are inside the window right now (for logs/tests). */
  size(): number {
    this.prune();
    return this.stamps.length;
  }

  private prune(): void {
    const cut = this.now() - this.windowMs;
    while (this.stamps.length && this.stamps[0] <= cut) this.stamps.shift();
  }
}

/** Thrown by acquire() when no slot will free up before the caller's deadline. */
export class RateLimitedError extends Error {
  constructor(public readonly waitedMs: number) {
    super(`rate window: no slot within ${waitedMs} ms`);
    this.name = 'RateLimitedError';
  }
}

/**
 * Wait for a free slot, then take it. `maxWaitMs` bounds the wait for callers that
 * answer a browser (a route behind a 60 s proxy must fail fast, not hang); omit it for
 * background work that can afford to queue. The sleep is injectable for tests.
 */
export async function acquire(
  w: RateWindow,
  opts: { maxWaitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const max = opts.maxWaitMs ?? Infinity;
  let waited = 0;
  for (;;) {
    const d = w.delay();
    if (d <= 0) { w.take(); return; }
    if (waited + d > max) throw new RateLimitedError(waited);
    await sleep(d);
    waited += d;
  }
}
