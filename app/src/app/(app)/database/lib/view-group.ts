// Pure grouping/bucketing helpers for Kanban (P2.9) and Calendar (P2.10) views.
// No React here so they can be unit-tested directly.

import type { RowT, FieldT } from './types';

export interface KanbanStack {
  id: string | null; // choice id, or null for the catch-all "empty" stack
  name: string;
  color?: string;
  rows: RowT[];
}

/** Group rows into Kanban columns by a singleSelect field's choices (+ empty). */
export function groupRowsByStack(rows: RowT[], field: FieldT, emptyLabel: string): KanbanStack[] {
  const choices = field.options?.choices ?? [];
  const stacks: KanbanStack[] = choices.map((c) => ({ id: c.id, name: c.name, color: c.color, rows: [] }));
  const empty: KanbanStack = { id: null, name: emptyLabel, rows: [] };
  const byId = new Map<string, KanbanStack>(stacks.map((s) => [s.id as string, s]));
  for (const r of rows) {
    const v = r.data[field.id];
    const target = typeof v === 'string' ? byId.get(v) : undefined;
    (target ?? empty).rows.push(r);
  }
  return [...stacks, empty];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar-day key (UTC) for an ISO date string; null if unparseable. */
export function dateKeyUTC(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Bucket rows by the UTC calendar day of their date field. */
export function bucketRowsByDate(rows: RowT[], dateFieldId: string): Map<string, RowT[]> {
  const m = new Map<string, RowT[]>();
  for (const r of rows) {
    const v = r.data[dateFieldId];
    if (typeof v !== 'string') continue;
    const k = dateKeyUTC(v);
    if (!k) continue;
    let arr = m.get(k);
    if (!arr) { arr = []; m.set(k, arr); }
    arr.push(r);
  }
  return m;
}

export interface MonthCell { key: string; day: number; inMonth: boolean; }

/** A Monday-first 6×7 month matrix of UTC calendar days. */
export function buildMonthMatrix(year: number, month0: number): MonthCell[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7; // days since the preceding Monday
  const start = new Date(Date.UTC(year, month0, 1 - mondayOffset));
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    cells.push({
      key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month0,
    });
  }
  return cells;
}
