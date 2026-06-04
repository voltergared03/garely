import { describe, it, expect } from 'vitest';
import {
  coerceCell,
  coerceRowData,
  mergeRowData,
  rowMatchesFilters,
  sortRows,
  type FieldLike,
} from '@/lib/base-rows';

const txt: FieldLike = { id: 'txt', type: 'text', options: null };
const num: FieldLike = { id: 'num', type: 'number', options: null };
const chk: FieldLike = { id: 'chk', type: 'checkbox', options: null };
const dat: FieldLike = { id: 'dat', type: 'date', options: null };
const sel: FieldLike = { id: 'sel', type: 'singleSelect', options: { choices: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } as any };
const msel: FieldLike = { id: 'msel', type: 'multiSelect', options: { choices: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }] } as any };
const perM: FieldLike = { id: 'perM', type: 'person', options: { multiple: true } as any };
const perS: FieldLike = { id: 'perS', type: 'person', options: { multiple: false } as any };

describe('coerceCell', () => {
  it('text: keeps non-empty strings, drops empty', () => {
    expect(coerceCell(txt, 'hi')).toBe('hi');
    expect(coerceCell(txt, '')).toBeUndefined();
    expect(coerceCell(txt, null)).toBeUndefined();
  });
  it('number: parses numerics incl. 0, drops non-numeric', () => {
    expect(coerceCell(num, '3')).toBe(3);
    expect(coerceCell(num, 0)).toBe(0);
    expect(coerceCell(num, 'abc')).toBeUndefined();
  });
  it('checkbox: true/false/strings, default false→false meaningful', () => {
    expect(coerceCell(chk, true)).toBe(true);
    expect(coerceCell(chk, false)).toBe(false);
    expect(coerceCell(chk, 'true')).toBe(true);
  });
  it('date: ISO-normalizes valid, drops invalid', () => {
    expect(coerceCell(dat, '2026-06-04')).toContain('2026-06-04');
    expect(coerceCell(dat, 'not-a-date')).toBeUndefined();
  });
  it('singleSelect: only an existing choice id', () => {
    expect(coerceCell(sel, 'a')).toBe('a');
    expect(coerceCell(sel, 'zzz')).toBeUndefined();
  });
  it('multiSelect: filters to existing ids', () => {
    expect(coerceCell(msel, ['x', 'zzz'])).toEqual(['x']);
    expect(coerceCell(msel, ['zzz'])).toBeUndefined();
  });
  it('person: array when multiple, scalar when single', () => {
    expect(coerceCell(perM, ['u1', 'u2'])).toEqual(['u1', 'u2']);
    expect(coerceCell(perS, 'u1')).toBe('u1');
    expect(coerceCell(perS, ['u1', 'u2'])).toBe('u1');
  });
});

describe('coerceRowData / mergeRowData', () => {
  it('drops unknown field keys', () => {
    expect(coerceRowData([txt], { txt: 'a', ghost: 'b' })).toEqual({ txt: 'a' });
  });
  it('merge sets a value and clears on empty', () => {
    expect(mergeRowData([txt], { txt: 'old' }, { txt: 'new' })).toEqual({ txt: 'new' });
    expect(mergeRowData([txt], { txt: 'old' }, { txt: '' })).toEqual({});
  });
});

describe('rowMatchesFilters', () => {
  const fields = [txt, num, chk, sel, msel];
  it('text contains / is', () => {
    expect(rowMatchesFilters({ txt: 'Hello World' }, fields, [{ fieldId: 'txt', op: 'contains', value: 'world' }])).toBe(true);
    expect(rowMatchesFilters({ txt: 'Hello' }, fields, [{ fieldId: 'txt', op: 'is', value: 'bye' }])).toBe(false);
  });
  it('number comparisons', () => {
    expect(rowMatchesFilters({ num: 5 }, fields, [{ fieldId: 'num', op: 'gt', value: 3 }])).toBe(true);
    expect(rowMatchesFilters({ num: 5 }, fields, [{ fieldId: 'num', op: 'lte', value: 4 }])).toBe(false);
  });
  it('isEmpty / isNotEmpty', () => {
    expect(rowMatchesFilters({}, fields, [{ fieldId: 'txt', op: 'isEmpty' }])).toBe(true);
    expect(rowMatchesFilters({ txt: 'x' }, fields, [{ fieldId: 'txt', op: 'isNotEmpty' }])).toBe(true);
  });
  it('singleSelect is / multiSelect hasAnyOf / checkbox', () => {
    expect(rowMatchesFilters({ sel: 'a' }, fields, [{ fieldId: 'sel', op: 'is', value: 'a' }])).toBe(true);
    expect(rowMatchesFilters({ msel: ['x'] }, fields, [{ fieldId: 'msel', op: 'hasAnyOf', value: ['y', 'x'] }])).toBe(true);
    expect(rowMatchesFilters({ chk: true }, fields, [{ fieldId: 'chk', op: 'is', value: true }])).toBe(true);
  });
  it('ANDs multiple conditions', () => {
    const ok = rowMatchesFilters({ txt: 'abc', num: 10 }, fields, [
      { fieldId: 'txt', op: 'contains', value: 'b' },
      { fieldId: 'num', op: 'gte', value: 10 },
    ]);
    expect(ok).toBe(true);
  });
});

describe('sortRows', () => {
  it('number ascending, empties last', () => {
    const rows = [{ data: { num: 3 } }, { data: {} }, { data: { num: 1 } }];
    const out = sortRows(rows, [num], [{ fieldId: 'num', dir: 'asc' }]);
    expect(out.map((r) => r.data.num)).toEqual([1, 3, undefined]);
  });
  it('descending flips order', () => {
    const rows = [{ data: { num: 1 } }, { data: { num: 9 } }];
    const out = sortRows(rows, [num], [{ fieldId: 'num', dir: 'desc' }]);
    expect(out.map((r) => r.data.num)).toEqual([9, 1]);
  });
});
