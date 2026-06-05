import { describe, it, expect } from 'vitest';
import { computeReorder } from './base-reorder';

describe('computeReorder', () => {
  const items = (positions: Record<string, number>) =>
    Object.entries(positions).map(([id, position]) => ({ id, position }));

  it('reorders a fully-listed set into the requested order', () => {
    const cur = items({ a: 0, b: 1, c: 2 });
    // new order c, a, b  → c→0, a→1, b→2
    const out = computeReorder(cur, ['c', 'a', 'b']);
    const byId = Object.fromEntries(out.map((u) => [u.id, u.position]));
    expect(byId).toEqual({ c: 0, a: 1, b: 2 });
  });

  it('returns only the items whose position changed', () => {
    const cur = items({ a: 0, b: 1, c: 2 });
    // swap b and c → a stays at 0 (unchanged, omitted)
    const out = computeReorder(cur, ['a', 'c', 'b']);
    expect(out.map((u) => u.id).sort()).toEqual(['b', 'c']);
    const byId = Object.fromEntries(out.map((u) => [u.id, u.position]));
    expect(byId).toEqual({ c: 1, b: 2 });
  });

  it('no-ops when the order matches the current order', () => {
    const cur = items({ a: 0, b: 1, c: 2 });
    expect(computeReorder(cur, ['a', 'b', 'c'])).toEqual([]);
  });

  it('permutes only within the listed subset, leaving others untouched', () => {
    // Page loaded rows a,b,c (positions 0,1,2); rows d,e exist at 3,4 but are NOT listed.
    const cur = items({ a: 0, b: 1, c: 2, d: 3, e: 4 });
    const out = computeReorder(cur, ['c', 'b', 'a']);
    // Only slots {0,1,2} are reused; d(3) and e(4) never appear.
    expect(out.every((u) => u.position <= 2)).toBe(true);
    expect(out.find((u) => u.id === 'd' || u.id === 'e')).toBeUndefined();
    const byId = Object.fromEntries(out.map((u) => [u.id, u.position]));
    expect(byId).toEqual({ c: 0, a: 2 }); // b stays at 1
  });

  it('reuses the listed items own (possibly non-contiguous) slots', () => {
    // a,c are listed (slots 0 and 4); b,d,e sit between them and stay put.
    const cur = items({ a: 0, b: 1, c: 4, d: 2, e: 3 });
    const out = computeReorder(cur, ['c', 'a']);
    // slots of {a,c} = [0,4] → c→0, a→4
    const byId = Object.fromEntries(out.map((u) => [u.id, u.position]));
    expect(byId).toEqual({ c: 0, a: 4 });
  });

  it('ignores unknown ids and de-dupes', () => {
    const cur = items({ a: 0, b: 1, c: 2 });
    const out = computeReorder(cur, ['zzz', 'c', 'c', 'a', 'b', 'zzz']);
    const byId = Object.fromEntries(out.map((u) => [u.id, u.position]));
    expect(byId).toEqual({ c: 0, a: 1, b: 2 }); // de-dupes/ignores unknowns → order c,a,b
  });

  it('returns [] for empty or single-item lists', () => {
    const cur = items({ a: 0, b: 1, c: 2 });
    expect(computeReorder(cur, [])).toEqual([]);
    expect(computeReorder(cur, ['b'])).toEqual([]);
    expect(computeReorder(cur, ['nope'])).toEqual([]);
  });

  it('handles duplicate positions in legacy data without collisions', () => {
    const cur = items({ a: 0, b: 0, c: 1 }); // a,b share slot 0
    const out = computeReorder(cur, ['c', 'b', 'a']);
    // slots sorted = [0,0,1] → c→0, b→0, a→1 ; positions stay a bijection over the multiset
    const positions = out.map((u) => u.position).concat(
      // include unchanged ones for the full-multiset check
      ['a', 'b', 'c'].filter((id) => !out.some((u) => u.id === id)).map((id) => cur.find((c) => c.id === id)!.position),
    );
    expect(positions.sort()).toEqual([0, 0, 1]);
  });
});
