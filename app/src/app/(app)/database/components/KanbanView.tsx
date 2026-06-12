'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Layers } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { cellText } from '../lib/cell-format';
import { groupRowsByStack } from '../lib/view-group';
import { TYPE_ICONS } from './field-icons';
import type { TableT, RowT, OrgMember } from '../lib/types';

export function KanbanView({
  table,
  rows,
  members,
  stackFieldId,
  onSetStackField,
  onCellChange,
  onAddRow,
  onOpenRecord,
  readOnly = false,
}: {
  table: TableT;
  rows: RowT[];
  members: OrgMember[];
  stackFieldId?: string | null;
  onSetStackField: (fieldId: string) => void;
  onCellChange: (rowId: string, fieldId: string, value: unknown) => void;
  onAddRow: (initial?: Record<string, unknown>) => void;
  onOpenRecord: (rowId: string) => void;
  /** Viewer mode: no card drag, no add-row, no stack-by reconfigure. */
  readOnly?: boolean;
}) {
  const t = useTranslations('database');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStack, setOverStack] = useState<string | null | undefined>(undefined);

  const selectFields = table.fields.filter((f) => f.type === 'singleSelect');
  const field = table.fields.find((f) => f.id === stackFieldId && f.type === 'singleSelect') ?? null;
  const primary = table.fields.find((f) => f.id === table.primaryFieldId) ?? table.fields[0] ?? null;
  const secondary = table.fields.filter((f) => f.id !== primary?.id && f.id !== field?.id && f.type !== 'totp').slice(0, 4);

  function drop(stackId: string | null) {
    if (dragId && field) onCellChange(dragId, field.id, stackId ?? undefined);
    setDragId(null);
    setOverStack(undefined);
  }

  const stackPicker = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <Layers size={15} style={{ color: 'var(--muted)' }} />
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('stackBy')}</span>
      <Select
        value={field?.id ?? ''}
        onChange={onSetStackField}
        options={selectFields.map((f) => ({ value: f.id, label: f.name }))}
        placeholder={t('selectField')}
        style={{ width: 220, padding: '6px 10px' }}
      />
    </div>
  );

  if (selectFields.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
        <Layers size={26} style={{ color: 'var(--muted)', marginBottom: 10 }} />
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{t('kanbanNeedsSelect')}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 5 }}>{t('kanbanNeedsSelectHint')}</div>
      </div>
    );
  }

  if (!field) {
    return (
      <div>
        {!readOnly && stackPicker}
        <div className="card" style={{ textAlign: 'center', padding: '36px 24px', fontSize: 13, color: 'var(--muted)' }}>{t('kanbanPickField')}</div>
      </div>
    );
  }

  const stacks = groupRowsByStack(rows, field, t('empty'));

  return (
    <div>
      {!readOnly && stackPicker}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 10 }}>
        {stacks.map((s) => {
          const over = overStack === s.id && dragId !== null;
          return (
            <div
              key={s.id ?? '__empty'}
              onDragOver={(e) => { e.preventDefault(); if (overStack !== s.id) setOverStack(s.id); }}
              onDrop={() => drop(s.id)}
              style={{
                width: 286, flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '70vh',
                background: 'var(--surface)', border: `1px solid ${over ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 14, transition: 'border-color .12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 8px' }}>
                {s.color ? (
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid var(--muted)', flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {s.id === null ? t('empty') : s.name}
                </span>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{s.rows.length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 10px 10px', overflowY: 'auto' }}>
                {s.rows.map((r) => {
                  const title = (primary && cellText(primary, r.data[primary.id], members)) || t('untitled');
                  return (
                    <div
                      key={r.id}
                      draggable={!readOnly}
                      onDragStart={readOnly ? undefined : () => setDragId(r.id)}
                      onDragEnd={readOnly ? undefined : () => { setDragId(null); setOverStack(undefined); }}
                      onClick={() => onOpenRecord(r.id)}
                      style={{
                        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 11px',
                        cursor: 'pointer', opacity: dragId === r.id ? 0.4 : 1, transition: 'opacity .12s, border-color .12s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-2, var(--accent))')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                      {secondary.map((f) => {
                        const txt = cellText(f, r.data[f.id], members);
                        if (!txt) return null;
                        const Icon = TYPE_ICONS[f.type] ?? null;
                        return (
                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 12, color: 'var(--text-2)' }}>
                            {Icon && <Icon size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txt}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {!readOnly && (
                  <button
                    onClick={() => onAddRow(s.id ? { [field.id]: s.id } : undefined)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 8px', border: '1px dashed var(--border)', borderRadius: 9, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 12.5 }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
                  >
                    <Plus size={14} /> {t('addRow')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
