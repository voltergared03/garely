import { Prisma } from '@prisma/client';
import type { FieldType } from './base-engine';

/**
 * Base engine — Row data layer (Phase 2, roadmap §14).
 *
 * Cell values live in `Row.data` (a JSONB bag keyed by fieldId). This module is
 * the single source of truth for: (a) coercing/validating an incoming cell value
 * against its field type, (b) the app-side filter + sort engine that the list
 * endpoint runs over a table's rows. App-side (in Node) is the v1 choice — fine
 * at Garely's scale (internal tables, hundreds–low-thousands of rows); move to
 * SQL-side JSONB expressions when a table outgrows that.
 */

export type FieldLike = { id: string; type: string; options: Prisma.JsonValue | null };
export type FilterCond = { fieldId: string; op: string; value?: unknown };
export type SortCond = { fieldId: string; dir?: 'asc' | 'desc' };
export type RowData = Record<string, unknown>;

function choiceIdSet(options: Prisma.JsonValue | null): Set<string> {
  const choices = (options as any)?.choices;
  if (!Array.isArray(choices)) return new Set();
  return new Set(choices.map((c: any) => c?.id).filter((id: any) => typeof id === 'string'));
}

/**
 * Coerce one incoming value to its field type's stored shape. Returns the
 * value to store, or `undefined` to OMIT the key (empty / invalid). `false`
 * (checkbox) and `0` (number) are meaningful and preserved.
 */
export function coerceCell(field: FieldLike, value: unknown): Prisma.InputJsonValue | undefined {
  const type = field.type as FieldType;

  if (type === 'checkbox') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value ? true : undefined;
  }
  if (value == null || value === '') return undefined;

  switch (type) {
    case 'text':
    case 'longText': {
      const s = String(value);
      return s.length ? s.slice(0, 100_000) : undefined;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'date': {
      const d = new Date(value as string | number);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    }
    case 'singleSelect': {
      const ids = choiceIdSet(field.options);
      return typeof value === 'string' && ids.has(value) ? value : undefined;
    }
    case 'multiSelect': {
      const ids = choiceIdSet(field.options);
      const arr = Array.isArray(value) ? value : [value];
      const valid = arr.filter((v): v is string => typeof v === 'string' && ids.has(v));
      return valid.length ? valid : undefined;
    }
    case 'person': {
      const multiple = !!(field.options as any)?.multiple;
      const arr = (Array.isArray(value) ? value : [value]).filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      );
      if (multiple) return arr.length ? arr : undefined;
      return arr.length ? arr[0] : undefined;
    }
    default:
      return undefined;
  }
}

/** Coerce a whole incoming data object: drop unknown field keys, validate each. */
export function coerceRowData(
  fields: FieldLike[],
  input: RowData,
): Record<string, Prisma.InputJsonValue> {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: Record<string, Prisma.InputJsonValue> = {};
  for (const [fieldId, raw] of Object.entries(input ?? {})) {
    const field = byId.get(fieldId);
    if (!field) continue;
    const coerced = coerceCell(field, raw);
    if (coerced !== undefined) out[fieldId] = coerced;
  }
  return out;
}

/**
 * Merge a partial patch into existing row data. A key whose value coerces to
 * empty is REMOVED (clears the cell); others are set. Returns a fresh object.
 */
export function mergeRowData(
  fields: FieldLike[],
  existing: RowData,
  patch: RowData,
): Record<string, Prisma.InputJsonValue> {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: Record<string, Prisma.InputJsonValue> = { ...(existing as any) };
  for (const [fieldId, raw] of Object.entries(patch ?? {})) {
    const field = byId.get(fieldId);
    if (!field) continue;
    const coerced = coerceCell(field, raw);
    if (coerced === undefined) delete out[fieldId];
    else out[fieldId] = coerced;
  }
  return out;
}

// ---- Filtering ------------------------------------------------------------
const isEmptyVal = (v: unknown) =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0);

const sameCalendarDay = (a: number, b: number) => {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
};

function matchOne(type: string, cell: unknown, op: string, val: unknown): boolean {
  if (op === 'isEmpty') return isEmptyVal(cell);
  if (op === 'isNotEmpty') return !isEmptyVal(cell);
  if (type === 'checkbox') {
    const want = val === true || val === 'true';
    return Boolean(cell) === want;
  }
  if (isEmptyVal(cell)) return false; // value ops never match an empty cell

  switch (type) {
    case 'text':
    case 'longText': {
      const s = String(cell).toLowerCase();
      const v = String(val ?? '').toLowerCase();
      if (op === 'is') return s === v;
      if (op === 'isNot') return s !== v;
      if (op === 'contains') return s.includes(v);
      if (op === 'notContains') return !s.includes(v);
      return true;
    }
    case 'number': {
      const n = Number(cell);
      const v = Number(val);
      if (!Number.isFinite(v)) return true;
      if (op === 'eq') return n === v;
      if (op === 'neq') return n !== v;
      if (op === 'gt') return n > v;
      if (op === 'gte') return n >= v;
      if (op === 'lt') return n < v;
      if (op === 'lte') return n <= v;
      return true;
    }
    case 'date': {
      const t = new Date(String(cell)).getTime();
      const v = new Date(String(val)).getTime();
      if (isNaN(t) || isNaN(v)) return false;
      if (op === 'is') return sameCalendarDay(t, v);
      if (op === 'before') return t < v;
      if (op === 'after') return t > v;
      return true;
    }
    case 'singleSelect': {
      if (op === 'is') return cell === val;
      if (op === 'isNot') return cell !== val;
      if (op === 'isAnyOf') return Array.isArray(val) && val.includes(cell);
      return true;
    }
    case 'multiSelect':
    case 'person': {
      const arr = Array.isArray(cell) ? cell : [cell];
      const vals = Array.isArray(val) ? val : [val];
      if (op === 'is') return arr.includes(val as never);
      if (op === 'hasAnyOf' || op === 'isAnyOf') return vals.some((v) => arr.includes(v as never));
      if (op === 'hasAllOf') return vals.every((v) => arr.includes(v as never));
      if (op === 'hasNoneOf') return !vals.some((v) => arr.includes(v as never));
      return true;
    }
    default:
      return true;
  }
}

/** True if `data` satisfies ALL filter conditions (unknown fields ignored). */
export function rowMatchesFilters(
  data: RowData,
  fields: FieldLike[],
  filters: FilterCond[] | undefined,
): boolean {
  if (!filters?.length) return true;
  const byId = new Map(fields.map((f) => [f.id, f]));
  return filters.every((f) => {
    const field = byId.get(f.fieldId);
    if (!field) return true;
    return matchOne(field.type, data?.[f.fieldId], f.op, f.value);
  });
}

// ---- Sorting --------------------------------------------------------------
function compareCells(type: string, x: unknown, y: unknown): number {
  const xe = isEmptyVal(x);
  const ye = isEmptyVal(y);
  if (xe && ye) return 0;
  if (xe) return 1; // empties sort last
  if (ye) return -1;
  switch (type) {
    case 'number':
      return Number(x) - Number(y);
    case 'date':
      return new Date(String(x)).getTime() - new Date(String(y)).getTime();
    case 'checkbox':
      return (x ? 1 : 0) - (y ? 1 : 0);
    case 'multiSelect':
    case 'person': {
      const xs = (Array.isArray(x) ? x : [x]).join(',');
      const ys = (Array.isArray(y) ? y : [y]).join(',');
      return xs.localeCompare(ys);
    }
    default:
      return String(x).localeCompare(String(y));
  }
}

/** Stable multi-key sort over rows by their cell values. */
export function sortRows<T extends { data: RowData }>(
  rows: T[],
  fields: FieldLike[],
  sorts: SortCond[] | undefined,
): T[] {
  if (!sorts?.length) return rows;
  const byId = new Map(fields.map((f) => [f.id, f]));
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const field = byId.get(s.fieldId);
      if (!field) continue;
      const cmp = compareCells(field.type, a.data?.[s.fieldId], b.data?.[s.fieldId]);
      if (cmp !== 0) return s.dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}
