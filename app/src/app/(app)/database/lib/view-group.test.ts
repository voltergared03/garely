import { describe, it, expect } from 'vitest';
import { groupRowsByStack, dateKeyUTC, bucketRowsByDate, buildMonthMatrix } from './view-group';
import type { RowT, FieldT } from './types';

const sel: FieldT = {
  id: 'st', tableId: 't', name: 'Status', type: 'singleSelect', position: 0,
  options: { choices: [{ id: 'todo', name: 'Todo' }, { id: 'done', name: 'Done', color: '#10b981' }] },
};
const row = (id: string, data: Record<string, unknown>): RowT => ({ id, tableId: 't', data, position: 0 });

describe('groupRowsByStack', () => {
  it('buckets rows by choice id, in choice order, empty stack last', () => {
    const rows = [row('a', { st: 'todo' }), row('b', { st: 'done' }), row('c', { st: 'todo' }), row('d', {})];
    const stacks = groupRowsByStack(rows, sel, 'Empty');
    expect(stacks.map((s) => s.id)).toEqual(['todo', 'done', null]);
    expect(stacks[0].rows.map((r) => r.id)).toEqual(['a', 'c']);
    expect(stacks[1].rows.map((r) => r.id)).toEqual(['b']);
    expect(stacks[1].color).toBe('#10b981');
    expect(stacks[2].name).toBe('Empty');
    expect(stacks[2].rows.map((r) => r.id)).toEqual(['d']);
  });
  it('rows with an unknown choice id fall into the empty stack', () => {
    const stacks = groupRowsByStack([row('x', { st: 'ghost' })], sel, '—');
    expect(stacks.find((s) => s.id === null)!.rows.map((r) => r.id)).toEqual(['x']);
  });
});

describe('dateKeyUTC', () => {
  it('extracts the UTC calendar day; null on garbage', () => {
    expect(dateKeyUTC('2026-06-05T00:00:00.000Z')).toBe('2026-06-05');
    expect(dateKeyUTC('2026-12-09')).toBe('2026-12-09');
    expect(dateKeyUTC('not-a-date')).toBeNull();
  });
});

describe('bucketRowsByDate', () => {
  it('groups rows by their date field UTC day; skips empty/invalid', () => {
    const rows = [
      row('a', { d: '2026-06-05T10:00:00Z' }),
      row('b', { d: '2026-06-05T20:00:00Z' }),
      row('c', { d: '2026-06-06' }),
      row('d', {}),
      row('e', { d: 'bad' }),
    ];
    const m = bucketRowsByDate(rows, 'd');
    expect(m.get('2026-06-05')!.map((r) => r.id)).toEqual(['a', 'b']);
    expect(m.get('2026-06-06')!.map((r) => r.id)).toEqual(['c']);
    expect([...m.keys()].length).toBe(2);
  });
});

describe('buildMonthMatrix', () => {
  it('is a Monday-first 6×7 grid covering the whole month', () => {
    const cells = buildMonthMatrix(2026, 5); // June 2026
    expect(cells).toHaveLength(42);
    expect(new Date(cells[0].key + 'T00:00:00Z').getUTCDay()).toBe(1); // starts on a Monday
    expect(cells.filter((c) => c.inMonth)).toHaveLength(30); // June = 30 days
    expect(cells.some((c) => c.key === '2026-06-01' && c.inMonth)).toBe(true);
    expect(cells.some((c) => c.key === '2026-06-30' && c.inMonth)).toBe(true);
  });
});
