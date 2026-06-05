import { describe, it, expect } from 'vitest';
import { reverseCellNext, linkIds } from './base-link-sync';

describe('linkIds', () => {
  it('extracts string ids from a link cell, ignores junk', () => {
    expect(linkIds(['a', 'b'])).toEqual(['a', 'b']);
    expect(linkIds(['a', 5, '', null])).toEqual(['a']);
    expect(linkIds(undefined)).toEqual([]);
    expect(linkIds('x')).toEqual([]);
  });
});

describe('reverseCellNext', () => {
  it('add (multiple): appends once, no dupes', () => {
    expect(reverseCellNext(['x'], 'src', 'add', true)).toEqual(['x', 'src']);
    expect(reverseCellNext(['src'], 'src', 'add', true)).toEqual(['src']);
    expect(reverseCellNext(undefined, 'src', 'add', true)).toEqual(['src']);
  });
  it('add (single): replaces with exactly the one id', () => {
    expect(reverseCellNext(['other'], 'src', 'add', false)).toEqual(['src']);
    expect(reverseCellNext([], 'src', 'add', false)).toEqual(['src']);
  });
  it('remove: drops the id (multiple and single alike)', () => {
    expect(reverseCellNext(['x', 'src', 'y'], 'src', 'remove', true)).toEqual(['x', 'y']);
    expect(reverseCellNext(['src'], 'src', 'remove', false)).toEqual([]);
    expect(reverseCellNext(undefined, 'src', 'remove', true)).toEqual([]);
  });
});
