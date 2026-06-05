import { describe, it, expect } from 'vitest';
import {
  filterOpsForType,
  defaultOpForType,
  valueKindFor,
  isMultiValueKind,
  isSortable,
} from './filter-ops';

describe('filterOpsForType (must mirror base-rows.matchOne)', () => {
  it('text family → contains/is/presence', () => {
    expect(filterOpsForType('text')).toEqual(['contains', 'notContains', 'is', 'isNot', 'isEmpty', 'isNotEmpty']);
    for (const t of ['longText', 'url', 'email', 'phone'] as const) {
      expect(filterOpsForType(t)).toEqual(filterOpsForType('text'));
    }
  });
  it('number family → comparison + presence', () => {
    expect(filterOpsForType('number')).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty']);
    for (const t of ['currency', 'percent', 'rating'] as const) {
      expect(filterOpsForType(t)).toEqual(filterOpsForType('number'));
    }
  });
  it('date → is/before/after/presence', () => {
    expect(filterOpsForType('date')).toEqual(['is', 'before', 'after', 'isEmpty', 'isNotEmpty']);
  });
  it('singleSelect → is/isNot/isAnyOf/presence', () => {
    expect(filterOpsForType('singleSelect')).toEqual(['is', 'isNot', 'isAnyOf', 'isEmpty', 'isNotEmpty']);
  });
  it('multiSelect & person → has* + presence', () => {
    expect(filterOpsForType('multiSelect')).toEqual(['hasAnyOf', 'hasAllOf', 'hasNoneOf', 'isEmpty', 'isNotEmpty']);
    expect(filterOpsForType('person')).toEqual(filterOpsForType('multiSelect'));
  });
  it('checkbox → is only', () => {
    expect(filterOpsForType('checkbox')).toEqual(['is']);
  });
  it('file/totp/link → presence only (no value matcher server-side)', () => {
    for (const t of ['file', 'totp', 'link'] as const) {
      expect(filterOpsForType(t)).toEqual(['isEmpty', 'isNotEmpty']);
    }
  });
});

describe('defaultOpForType', () => {
  it('is the first operator offered for the type', () => {
    expect(defaultOpForType('text')).toBe('contains');
    expect(defaultOpForType('number')).toBe('eq');
    expect(defaultOpForType('date')).toBe('is');
    expect(defaultOpForType('checkbox')).toBe('is');
    expect(defaultOpForType('file')).toBe('isEmpty');
  });
});

describe('valueKindFor', () => {
  it('presence ops never need a value editor', () => {
    expect(valueKindFor('text', 'isEmpty')).toBe('none');
    expect(valueKindFor('number', 'isNotEmpty')).toBe('none');
    expect(valueKindFor('person', 'isEmpty')).toBe('none');
  });
  it('checkbox is → boolean; number → number; date → date; text → text', () => {
    expect(valueKindFor('checkbox', 'is')).toBe('boolean');
    expect(valueKindFor('currency', 'gt')).toBe('number');
    expect(valueKindFor('date', 'before')).toBe('date');
    expect(valueKindFor('email', 'contains')).toBe('text');
  });
  it('singleSelect: single choice for is/isNot, multi for isAnyOf', () => {
    expect(valueKindFor('singleSelect', 'is')).toBe('choice');
    expect(valueKindFor('singleSelect', 'isNot')).toBe('choice');
    expect(valueKindFor('singleSelect', 'isAnyOf')).toBe('choices');
  });
  it('multiSelect → choices, person → members', () => {
    expect(valueKindFor('multiSelect', 'hasAnyOf')).toBe('choices');
    expect(valueKindFor('person', 'hasAllOf')).toBe('members');
  });
});

describe('isMultiValueKind', () => {
  it('only choices/members expect an array value', () => {
    expect(isMultiValueKind('choices')).toBe(true);
    expect(isMultiValueKind('members')).toBe(true);
    expect(isMultiValueKind('choice')).toBe(false);
    expect(isMultiValueKind('text')).toBe(false);
    expect(isMultiValueKind('none')).toBe(false);
  });
});

describe('isSortable', () => {
  it('common types sortable; file/totp/link are not', () => {
    for (const t of ['text', 'number', 'date', 'person', 'checkbox', 'singleSelect', 'multiSelect', 'url'] as const) {
      expect(isSortable(t)).toBe(true);
    }
    for (const t of ['file', 'totp', 'link'] as const) {
      expect(isSortable(t)).toBe(false);
    }
  });
});
