import type { FieldT, OrgMember, RowT, TableT } from './types';

type LinkItem = { id: string; label?: string };

function memberName(members: OrgMember[], id: string): string {
  const m = members.find((x) => x.id === id);
  return m ? (m.name || m.email || id) : id;
}

/** Render a single presented cell value as a flat string for CSV. */
function formatCell(field: FieldT, value: unknown, members: OrgMember[]): string {
  if (value == null || value === '') return '';
  const choices = field.options?.choices ?? [];
  switch (field.type) {
    // Never export secrets — these are excluded as columns too, defence in depth.
    case 'password':
    case 'totp':
      return '';
    case 'checkbox':
      return value ? 'TRUE' : 'FALSE';
    case 'singleSelect':
      return typeof value === 'string' ? (choices.find((c) => c.id === value)?.name ?? '') : '';
    case 'multiSelect':
      return Array.isArray(value)
        ? value.map((id) => choices.find((c) => c.id === id)?.name ?? '').filter(Boolean).join(', ')
        : '';
    case 'person': {
      const ids = Array.isArray(value) ? value : [value];
      return ids.filter((v): v is string => typeof v === 'string').map((id) => memberName(members, id)).join(', ');
    }
    case 'link': {
      if (!Array.isArray(value)) return '';
      return value
        .map((v) => (typeof v === 'string' ? v : (v as LinkItem)?.label || (v as LinkItem)?.id || ''))
        .filter(Boolean)
        .join(', ');
    }
    case 'file': {
      if (!Array.isArray(value)) return '';
      return value.map((f) => (f && typeof f === 'object' ? (f as { name?: string }).name ?? '' : '')).filter(Boolean).join(', ');
    }
    case 'date': {
      if (typeof value !== 'string') return String(value);
      const d = new Date(value);
      if (isNaN(d.getTime())) return value;
      return field.options?.includeTime ? d.toISOString() : d.toISOString().slice(0, 10);
    }
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

/** RFC-4180 cell escaping: quote when the value has a comma, quote or newline. */
function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build a Cyrillic-safe CSV for a table's rows. A UTF-8 BOM + CRLF line endings
 * keep Excel and Google Sheets happy with non-Latin text. Secret field types
 * (password / TOTP) are dropped entirely — their values are never exported.
 */
export function buildCsv(table: TableT, rows: RowT[], members: OrgMember[]): string {
  const fields = [...table.fields]
    .filter((f) => f.type !== 'password' && f.type !== 'totp')
    .sort((a, b) => a.position - b.position);
  const header = fields.map((f) => csvCell(f.name)).join(',');
  const lines = rows.map((row) =>
    fields.map((f) => csvCell(formatCell(f, row.data?.[f.id], members))).join(','),
  );
  return '﻿' + [header, ...lines].join('\r\n');
}

/** Trigger a client-side download of the given CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Fetch every row of a table/view, paging past the API's per-request cap so the
 * export isn't truncated to the first page.
 */
export async function fetchAllRows(tableId: string, viewId?: string | null): Promise<RowT[]> {
  const out: RowT[] = [];
  const limit = 1000;
  let offset = 0;
  // Hard stop well above any realistic table to avoid an infinite loop.
  for (let guard = 0; guard < 1000; guard++) {
    const qs = new URLSearchParams();
    if (viewId) qs.set('view', viewId);
    qs.set('limit', String(limit));
    qs.set('offset', String(offset));
    const res = await fetch(`/api/tables/${tableId}/rows?${qs.toString()}`);
    if (!res.ok) break;
    const d = await res.json();
    const batch = ((d.rows as RowT[]) ?? []).map((r) => ({ ...r, data: r.data || {} }));
    out.push(...batch);
    const total = typeof d.total === 'number' ? d.total : out.length;
    offset += batch.length;
    if (batch.length === 0 || out.length >= total) break;
  }
  return out;
}
