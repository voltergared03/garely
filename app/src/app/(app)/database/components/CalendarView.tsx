'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { cellText } from '../lib/cell-format';
import { bucketRowsByDate, buildMonthMatrix } from '../lib/view-group';
import type { TableT, RowT, OrgMember } from '../lib/types';

const pad = (n: number) => String(n).padStart(2, '0');
const MAX_CHIPS = 3;

export function CalendarView({
  table,
  rows,
  members,
  dateFieldId,
  onSetDateField,
  onAddRow,
  onOpenRecord,
  readOnly = false,
}: {
  table: TableT;
  rows: RowT[];
  members: OrgMember[];
  dateFieldId?: string | null;
  onSetDateField: (fieldId: string) => void;
  onAddRow: (initial?: Record<string, unknown>) => void;
  onOpenRecord: (rowId: string) => void;
  /** Viewer mode: no per-day add, no date-field reconfigure. */
  readOnly?: boolean;
}) {
  const t = useTranslations('database');
  const locale = useLocale();
  const now = new Date();
  const [view, setView] = useState<{ year: number; month0: number }>({ year: now.getUTCFullYear(), month0: now.getUTCMonth() });

  const dateFields = table.fields.filter((f) => f.type === 'date');
  const field = table.fields.find((f) => f.id === dateFieldId && f.type === 'date') ?? null;
  const primary = table.fields.find((f) => f.id === table.primaryFieldId) ?? table.fields[0] ?? null;

  const picker = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <CalendarDays size={15} style={{ color: 'var(--muted)' }} />
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('dateField')}</span>
      <Select
        value={field?.id ?? ''}
        onChange={onSetDateField}
        options={dateFields.map((f) => ({ value: f.id, label: f.name }))}
        placeholder={t('selectField')}
        style={{ width: 200, padding: '6px 10px' }}
      />
    </div>
  );

  if (dateFields.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
        <CalendarDays size={26} style={{ color: 'var(--muted)', marginBottom: 10 }} />
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{t('calendarNeedsDate')}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 5 }}>{t('calendarNeedsDateHint')}</div>
      </div>
    );
  }
  if (!field) {
    return (
      <div>
        {!readOnly && <div style={{ marginBottom: 12 }}>{picker}</div>}
        <div className="card" style={{ textAlign: 'center', padding: '36px 24px', fontSize: 13, color: 'var(--muted)' }}>{t('calendarPickField')}</div>
      </div>
    );
  }

  const cells = buildMonthMatrix(view.year, view.month0);
  const buckets = bucketRowsByDate(rows, field.id);
  const todayKey = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(view.year, view.month0, 1)));

  // Monday-first weekday short names (2024-01-01 was a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))),
  );

  const prev = () => setView((v) => (v.month0 === 0 ? { year: v.year - 1, month0: 11 } : { year: v.year, month0: v.month0 - 1 }));
  const next = () => setView((v) => (v.month0 === 11 ? { year: v.year + 1, month0: 0 } : { year: v.year, month0: v.month0 + 1 }));
  const goToday = () => setView({ year: now.getUTCFullYear(), month0: now.getUTCMonth() });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-icon" onClick={prev} aria-label={t('prevMonth')} style={{ width: 30, height: 30 }}><ChevronLeft size={17} /></button>
        <div style={{ fontSize: 15, fontWeight: 700, minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{monthLabel}</div>
        <button className="btn btn-ghost btn-icon" onClick={next} aria-label={t('nextMonth')} style={{ width: 30, height: 30 }}><ChevronRight size={17} /></button>
        <button className="btn btn-ghost" onClick={goToday} style={{ fontSize: 12.5 }}>{t('today')}</button>
        <div style={{ flex: 1 }} />
        {!readOnly && picker}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {weekdays.map((w, i) => (
            <div key={i} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', borderRight: i < 6 ? '1px solid var(--border)' : 'none', textAlign: 'left' }}>{w}</div>
          ))}
          {cells.map((c, i) => {
            const dayRows = buckets.get(c.key) ?? [];
            const isToday = c.key === todayKey;
            return (
              <div
                key={c.key}
                style={{
                  minHeight: 104, padding: 6, display: 'flex', flexDirection: 'column', gap: 4,
                  borderBottom: i < 35 ? '1px solid var(--border)' : 'none',
                  borderRight: (i % 7) < 6 ? '1px solid var(--border)' : 'none',
                  background: c.inMonth ? 'transparent' : 'color-mix(in oklab, var(--surface) 50%, transparent)',
                  position: 'relative',
                }}
                className="db-cal-cell"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontSize: 12, fontWeight: isToday ? 700 : 500,
                    color: !c.inMonth ? 'var(--muted)' : isToday ? '#fff' : 'var(--text-2)',
                    background: isToday ? 'var(--accent)' : 'transparent',
                    width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{c.day}</span>
                  {!readOnly && (
                    <button
                      className="db-cal-add"
                      onClick={() => onAddRow({ [field.id]: c.key })}
                      aria-label={t('addRow')}
                      style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', padding: 2, borderRadius: 5, opacity: 0 }}
                    >
                      <Plus size={13} />
                    </button>
                  )}
                </div>
                {dayRows.slice(0, MAX_CHIPS).map((r) => {
                  const title = (primary && cellText(primary, r.data[primary.id], members)) || t('untitled');
                  return (
                    <button
                      key={r.id}
                      onClick={() => onOpenRecord(r.id)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 6, padding: '3px 7px',
                        background: 'color-mix(in oklab, var(--accent) 16%, transparent)', color: 'var(--text)', cursor: 'pointer',
                        fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >{title}</button>
                  );
                })}
                {dayRows.length > MAX_CHIPS && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 4 }}>+{dayRows.length - MAX_CHIPS}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
