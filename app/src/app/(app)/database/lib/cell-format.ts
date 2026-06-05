// Compact, read-only text rendering of a cell value — used by Kanban cards and
// Calendar chips (where an editable FieldCell would be too heavy). Returns a
// short display string; '' means "nothing to show". Never reveals secrets
// (totp returns '').

import type { FieldT, OrgMember } from './types';

function num(value: unknown, precision?: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return typeof precision === 'number' ? n.toFixed(Math.max(0, Math.min(8, precision))) : String(n);
}

export function cellText(field: FieldT, value: unknown, members: OrgMember[]): string {
  if (value == null || value === '') return '';
  switch (field.type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'phone':
      return String(value);
    case 'number':
      return num(value, field.options?.precision);
    case 'currency':
      return `${field.options?.symbol ?? '₴'}${num(value, field.options?.precision ?? 2)}`;
    case 'percent':
      return `${num(value, field.options?.precision)}%`;
    case 'rating': {
      const n = Math.max(0, Math.min(10, Math.round(Number(value) || 0)));
      return n > 0 ? '★'.repeat(n) : '';
    }
    case 'checkbox':
      return value ? '✓' : '';
    case 'date':
      return String(value).slice(0, 10);
    case 'singleSelect':
      return field.options?.choices?.find((c) => c.id === value)?.name ?? '';
    case 'multiSelect': {
      const ids = Array.isArray(value) ? (value as string[]) : [];
      return ids.map((id) => field.options?.choices?.find((c) => c.id === id)?.name).filter(Boolean).join(', ');
    }
    case 'person': {
      const ids = Array.isArray(value) ? (value as string[]) : [value as string];
      return ids.map((id) => { const m = members.find((x) => x.id === id); return m?.name || m?.email; }).filter(Boolean).join(', ');
    }
    case 'file': {
      const arr = Array.isArray(value) ? value : [];
      return arr.length ? String(arr.length) : '';
    }
    case 'link': {
      const arr = Array.isArray(value) ? (value as { label?: string }[]) : [];
      return arr.map((l) => l?.label).filter(Boolean).join(', ');
    }
    case 'totp':
    default:
      return '';
  }
}
