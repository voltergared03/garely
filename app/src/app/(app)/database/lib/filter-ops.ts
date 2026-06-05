// Pure filter/sort metadata for the grid toolbar (P2.8). No React / i18n here so
// it can be unit-tested in isolation AND imported by the client toolbar.
//
// The operator sets MUST stay in lock-step with the server-side matcher in
// `src/lib/base-rows.ts` (`matchOne`) — every op listed here is one that engine
// understands for that field-type family. The toolbar persists {filters,sorts}
// onto the view's config; the rows endpoint re-applies them server-side.

import type { FieldType } from './types';

export type FilterOp =
  | 'is' | 'isNot' | 'contains' | 'notContains'
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'before' | 'after'
  | 'isAnyOf' | 'hasAnyOf' | 'hasAllOf' | 'hasNoneOf'
  | 'isEmpty' | 'isNotEmpty';

const PRESENCE: FilterOp[] = ['isEmpty', 'isNotEmpty'];
const TEXT_OPS: FilterOp[] = ['contains', 'notContains', 'is', 'isNot', ...PRESENCE];
const NUMBER_OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', ...PRESENCE];
const DATE_OPS: FilterOp[] = ['is', 'before', 'after', ...PRESENCE];
const SINGLE_SELECT_OPS: FilterOp[] = ['is', 'isNot', 'isAnyOf', ...PRESENCE];
const MULTI_OPS: FilterOp[] = ['hasAnyOf', 'hasAllOf', 'hasNoneOf', ...PRESENCE];
const CHECKBOX_OPS: FilterOp[] = ['is'];

/** Operators offered for a field type (first one is the sensible default). */
export function filterOpsForType(type: FieldType): FilterOp[] {
  switch (type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'phone':
      return TEXT_OPS;
    case 'number':
    case 'currency':
    case 'percent':
    case 'rating':
      return NUMBER_OPS;
    case 'date':
      return DATE_OPS;
    case 'singleSelect':
      return SINGLE_SELECT_OPS;
    case 'multiSelect':
    case 'person':
      return MULTI_OPS;
    case 'checkbox':
      return CHECKBOX_OPS;
    // file / totp / link — no value matcher server-side; presence only.
    default:
      return PRESENCE;
  }
}

export function defaultOpForType(type: FieldType): FilterOp {
  return filterOpsForType(type)[0];
}

/** Which value editor a (type, op) pair needs in the toolbar. */
export type ValueKind = 'none' | 'text' | 'number' | 'date' | 'boolean' | 'choice' | 'choices' | 'members';

export function valueKindFor(type: FieldType, op: FilterOp): ValueKind {
  if (op === 'isEmpty' || op === 'isNotEmpty') return 'none';
  if (type === 'checkbox') return 'boolean';
  switch (type) {
    case 'number':
    case 'currency':
    case 'percent':
    case 'rating':
      return 'number';
    case 'date':
      return 'date';
    case 'singleSelect':
      return op === 'isAnyOf' ? 'choices' : 'choice';
    case 'multiSelect':
      return 'choices';
    case 'person':
      return 'members';
    default:
      return 'text';
  }
}

/** Whether a value editor expects an array value (multi-pick) for this kind. */
export function isMultiValueKind(kind: ValueKind): boolean {
  return kind === 'choices' || kind === 'members';
}

// Sorting: compareCells handles these meaningfully; file/totp/link are excluded
// (they'd string-compare opaque blobs/ids — not useful to a user).
const SORTABLE = new Set<FieldType>([
  'text', 'longText', 'number', 'currency', 'percent', 'rating',
  'date', 'checkbox', 'singleSelect', 'multiSelect', 'person',
  'url', 'email', 'phone',
]);

export function isSortable(type: FieldType): boolean {
  return SORTABLE.has(type);
}
