import { describe, it, expect } from 'vitest';
import { RateWindow, RateLimitedError, acquire } from './rate-window';

describe('RateWindow', () => {
  it('lets `limit` calls through at once, then asks the caller to wait for the oldest to expire', () => {
    let t = 1000;
    const w = new RateWindow(3, 1000, () => t);
    expect(w.delay()).toBe(0); w.take();
    t += 100; expect(w.delay()).toBe(0); w.take();
    t += 100; expect(w.delay()).toBe(0); w.take();
    t += 100; // 3 in the window → the first (at 1000) leaves at 2000
    expect(w.delay()).toBe(2000 - t);
    t = 2000; expect(w.delay()).toBe(0);
  });

  it('forgets calls that have left the window', () => {
    let t = 0;
    const w = new RateWindow(2, 1000, () => t);
    w.take(); t = 500; w.take();
    expect(w.size()).toBe(2);
    t = 1001; expect(w.size()).toBe(1); // the one at 0 is gone
    t = 1501; expect(w.size()).toBe(0);
  });

  it('acquire sleeps exactly the delay and then takes the slot', async () => {
    let t = 0;
    const w = new RateWindow(1, 1000, () => t);
    const slept: number[] = [];
    const sleep = async (ms: number) => { slept.push(ms); t += ms; };
    await acquire(w, { sleep }); // free
    await acquire(w, { sleep }); // must wait 1000
    expect(slept).toEqual([1000]);
    expect(w.size()).toBe(1);
  });
});

describe('RateWindow guards', () => {
  it('clamps a limit below 1 so the window can always open', () => {
    let t = 0;
    for (const bad of [-1, 0, NaN, 0.4]) {
      const w = new RateWindow(bad, 1000, () => t);
      expect(w.delay()).toBe(0);
      w.take();
      expect(w.delay()).toBe(1000);
    }
  });

  it('acquire gives up with RateLimitedError when the deadline cannot be met, without sleeping', async () => {
    let t = 0;
    const w = new RateWindow(1, 1000, () => t);
    w.take();
    const slept: number[] = [];
    await expect(acquire(w, { maxWaitMs: 500, sleep: async (ms) => { slept.push(ms); t += ms; } })).rejects.toBeInstanceOf(RateLimitedError);
    expect(slept).toEqual([]);
    await acquire(w, { maxWaitMs: 1000, sleep: async (ms) => { slept.push(ms); t += ms; } }); // exactly enough
    expect(slept).toEqual([1000]);
  });
});
