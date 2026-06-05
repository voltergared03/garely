'use client';

import { useState, useRef, useEffect, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import {
  Plus, Trash2, MoreHorizontal, Pencil, Type, AlignLeft, Hash, List, Tags,
  Calendar, User, CheckSquare, Star, Banknote, Percent, Link2, AtSign, Phone, Paperclip, Maximize2, KeyRound,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { FieldCell } from './FieldCell';
import { FieldEditor } from './FieldEditor';
import type { TableT, RowT, OrgMember, FieldT, FieldType } from '../lib/types';

const TYPE_ICONS: Record<FieldType, ElementType> = {
  text: Type, longText: AlignLeft, number: Hash, singleSelect: List,
  multiSelect: Tags, date: Calendar, person: User, checkbox: CheckSquare,
  currency: Banknote, percent: Percent, rating: Star,
  url: Link2, email: AtSign, phone: Phone, file: Paperclip, totp: KeyRound,
};

export function GridView({
  table,
  rows,
  members,
  onCellChange,
  onAddRow,
  onAddField,
  onEditField,
  onDeleteRow,
  onDeleteField,
  onSetPrimary,
}: {
  table: TableT;
  rows: RowT[];
  members: OrgMember[];
  onCellChange: (rowId: string, fieldId: string, value: unknown) => void;
  onAddRow: () => void;
  onAddField: (name: string, type: FieldType, options?: unknown) => void;
  onEditField: (fieldId: string, patch: { name: string; type: FieldType; options?: unknown }) => void;
  onDeleteRow: (rowId: string) => void;
  onDeleteField: (fieldId: string) => void;
  onSetPrimary: (fieldId: string) => void;
}) {
  const t = useTranslations('database');
  const [editor, setEditor] = useState<{ field: FieldT | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const fields = [...table.fields].sort((a, b) => a.position - b.position);
  const template = `48px ${fields.map((f) => (f.id === table.primaryFieldId ? '240px' : '180px')).join(' ')} 160px`;
  const detailRow = detailId ? rows.find((r) => r.id === detailId) ?? null : null;

  const headerCell: CSSProperties = {
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
    height: 38, display: 'flex', alignItems: 'center', padding: '0 10px',
    fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
  };
  const bodyCell: CSSProperties = {
    borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
    height: 36, display: 'flex', alignItems: 'center', overflow: 'hidden',
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto', background: 'var(--bg)', maxHeight: '74vh' }}>
      <div style={{ minWidth: 'max-content' }}>
        <div style={{ display: 'grid', gridTemplateColumns: template, position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ ...headerCell, justifyContent: 'center', color: 'var(--muted)' }}>#</div>
          {fields.map((f) => (
            <FieldHeaderCell
              key={f.id}
              field={f}
              isPrimary={f.id === table.primaryFieldId}
              style={headerCell}
              onEdit={() => setEditor({ field: f })}
              onDelete={() => onDeleteField(f.id)}
              onSetPrimary={() => onSetPrimary(f.id)}
            />
          ))}
          <div style={headerCell}>
            <button
              onClick={() => setEditor({ field: null })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}
            >
              <Plus size={14} /> {t('addField')}
            </button>
          </div>
        </div>

        {rows.map((row, ri) => (
          <div key={row.id} className="db-grid-row" style={{ display: 'grid', gridTemplateColumns: template }}>
            <RowNumCell n={ri + 1} style={bodyCell} onDelete={() => onDeleteRow(row.id)} />
            {fields.map((f) => (
              <div key={f.id} style={bodyCell}>
                <FieldCell field={f} value={row.data[f.id]} members={members} baseId={table.baseId} rowId={row.id} onCommit={(v) => onCellChange(row.id, f.id, v)} />
              </div>
            ))}
            <div style={{ ...bodyCell, justifyContent: 'flex-end', paddingRight: 6 }}>
              <button
                className="row-expand"
                onClick={() => setDetailId(row.id)}
                aria-label={t('openRecord')}
                title={t('openRecord')}
                style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'inline-flex', padding: 4, borderRadius: 6, transition: 'opacity .12s' }}
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div style={{ padding: '26px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-2)' }}>{t('noRows')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{t('noRowsHint')}</div>
        </div>
      )}

      <button
        onClick={onAddRow}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '10px 14px',
          border: 'none', borderTop: rows.length ? 'none' : '1px solid var(--border)',
          background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13,
        }}
      >
        <Plus size={15} /> {t('addRow')}
      </button>

      <FieldEditor
        open={!!editor}
        initial={editor?.field ?? null}
        onClose={() => setEditor(null)}
        onSave={(d) => {
          if (editor?.field) onEditField(editor.field.id, d);
          else onAddField(d.name, d.type, d.options);
        }}
      />

      {detailRow && (
        <RowDetailModal
          table={table}
          row={detailRow}
          members={members}
          onCellChange={onCellChange}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

/** Expanded single-record view — every field stacked with its editor (same
 *  FieldCell as the grid, so edits persist through the same onCellChange path). */
function RowDetailModal({
  table,
  row,
  members,
  onCellChange,
  onClose,
}: {
  table: TableT;
  row: RowT;
  members: OrgMember[];
  onCellChange: (rowId: string, fieldId: string, value: unknown) => void;
  onClose: () => void;
}) {
  const t = useTranslations('database');
  const fields = [...table.fields].sort((a, b) => a.position - b.position);
  const primary = fields.find((f) => f.id === table.primaryFieldId);
  const titleVal = primary && typeof row.data[primary.id] === 'string' ? (row.data[primary.id] as string) : '';

  return (
    <Modal open onClose={onClose} title={titleVal || t('untitled')} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '64vh', overflowY: 'auto', paddingRight: 4 }}>
        {fields.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>—</div>}
        {fields.map((f) => {
          const Icon = TYPE_ICONS[f.type] ?? Type;
          const isPrimary = f.id === table.primaryFieldId;
          return (
            <div key={f.id}>
              <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isPrimary ? <Star size={12} style={{ color: 'var(--amber, #f59e0b)' }} /> : <Icon size={12} style={{ opacity: 0.6 }} />}
                {f.name}
              </label>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, minHeight: 40, display: 'flex', alignItems: 'center', background: 'var(--bg)', overflow: 'hidden' }}>
                <FieldCell
                  field={f}
                  value={row.data[f.id]}
                  members={members}
                  baseId={table.baseId}
                  rowId={row.id}
                  onCommit={(v) => onCellChange(row.id, f.id, v)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function RowNumCell({ n, style, onDelete }: { n: number; style: CSSProperties; onDelete: () => void }) {
  const t = useTranslations('database');
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ ...style, justifyContent: 'center', color: 'var(--muted)', fontSize: 12, position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover ? (
        <button onClick={onDelete} title={t('deleteRow')} aria-label={t('deleteRow')} style={{ border: 'none', background: 'transparent', color: 'var(--red, #ef4444)', cursor: 'pointer', display: 'flex' }}>
          <Trash2 size={14} />
        </button>
      ) : (
        <span className="mono">{n}</span>
      )}
    </div>
  );
}

function FieldHeaderCell({
  field,
  isPrimary,
  style,
  onEdit,
  onDelete,
  onSetPrimary,
}: {
  field: FieldT;
  isPrimary: boolean;
  style: CSSProperties;
  onEdit: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
}) {
  const t = useTranslations('database');
  const Icon = TYPE_ICONS[field.type] ?? Type;
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  return (
    <div style={{ ...style, justifyContent: 'space-between', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
        {isPrimary ? <Star size={13} style={{ color: 'var(--amber, #f59e0b)', flexShrink: 0 }} /> : <Icon size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.name}</span>
      </span>
      <button
        ref={ref}
        aria-label={t('menu')}
        onClick={(e) => {
          e.stopPropagation();
          const r = ref.current!.getBoundingClientRect();
          setPos({ left: r.right - 188, top: r.bottom });
          setMenu((m) => !m);
        }}
        style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
      >
        <MoreHorizontal size={15} />
      </button>
      {menu && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{ position: 'fixed', left: Math.max(pos.left, 8), top: pos.top + 4, width: 188, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,.5)', padding: 4, zIndex: 2000 }}
          >
            <MenuItem icon={<Pencil size={14} />} label={t('editField')} onClick={() => { onEdit(); setMenu(false); }} />
            {!isPrimary && <MenuItem icon={<Star size={14} />} label={t('setPrimary')} onClick={() => { onSetPrimary(); setMenu(false); }} />}
            {!isPrimary && <MenuItem icon={<Trash2 size={14} />} label={t('deleteField')} danger onClick={() => { onDelete(); setMenu(false); }} />}
          </div>,
          document.body,
        )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 'none', borderRadius: 7, background: 'transparent', color: danger ? 'var(--red, #ef4444)' : 'var(--text)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon} {label}
    </button>
  );
}
