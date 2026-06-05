'use client';

import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, MoreHorizontal, Pencil, Star, Type, Maximize2 } from 'lucide-react';
import { FieldCell } from './FieldCell';
import { FieldEditor } from './FieldEditor';
import { RecordModal } from './RecordModal';
import { TYPE_ICONS } from './field-icons';
import type { TableT, RowT, OrgMember, FieldT, FieldType } from '../lib/types';

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
  onResizeField,
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
  onResizeField: (fieldId: string, width: number) => void;
}) {
  const t = useTranslations('database');
  const [editor, setEditor] = useState<{ field: FieldT | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({}); // in-session drag overrides
  const fields = [...table.fields].sort((a, b) => a.position - b.position);
  const widthOf = (f: FieldT) => widths[f.id] ?? f.width ?? (f.id === table.primaryFieldId ? 240 : 180);
  const template = `48px ${fields.map((f) => `${widthOf(f)}px`).join(' ')} 160px`;
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
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{ overflow: 'auto', maxHeight: '74vh' }}>
      <div style={{ minWidth: 'max-content' }}>
        <div style={{ display: 'grid', gridTemplateColumns: template, position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ ...headerCell, justifyContent: 'center', color: 'var(--muted)', position: 'sticky', left: 0, zIndex: 3 }}>#</div>
          {fields.map((f, ci) => (
            <FieldHeaderCell
              key={f.id}
              field={f}
              isPrimary={f.id === table.primaryFieldId}
              style={headerCell}
              width={widthOf(f)}
              frozen={ci === 0}
              leftOffset={48}
              onEdit={() => setEditor({ field: f })}
              onDelete={() => onDeleteField(f.id)}
              onSetPrimary={() => onSetPrimary(f.id)}
              onResize={(w) => setWidths((prev) => ({ ...prev, [f.id]: w }))}
              onResizeEnd={(w) => onResizeField(f.id, w)}
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
            {fields.map((f, ci) => (
              <div key={f.id} style={ci === 0 ? { ...bodyCell, position: 'sticky', left: 48, zIndex: 1, background: 'inherit', boxShadow: '2px 0 5px -2px rgba(0,0,0,.35)' } : bodyCell}>
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
      </div>

      {rows.length === 0 && (
        <div style={{ padding: '34px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-2)' }}>{t('noRows')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{t('noRowsHint')}</div>
        </div>
      )}

      <button
        onClick={() => onAddRow()}
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
        <RecordModal
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

function RowNumCell({ n, style, onDelete }: { n: number; style: CSSProperties; onDelete: () => void }) {
  const t = useTranslations('database');
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ ...style, justifyContent: 'center', color: 'var(--muted)', fontSize: 12, position: 'sticky', left: 0, zIndex: 1, background: 'inherit' }}
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
  width,
  onResize,
  onResizeEnd,
  frozen,
  leftOffset,
}: {
  field: FieldT;
  isPrimary: boolean;
  style: CSSProperties;
  width: number;
  onEdit: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
  onResize: (w: number) => void;
  onResizeEnd: (w: number) => void;
  frozen?: boolean;
  leftOffset?: number;
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

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const clamp = (w: number) => Math.max(80, Math.min(800, w));
    const move = (ev: MouseEvent) => onResize(clamp(width + ev.clientX - startX));
    const up = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onResizeEnd(clamp(width + ev.clientX - startX));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div style={{ ...style, justifyContent: 'space-between', gap: 6, position: frozen ? 'sticky' : 'relative', left: frozen ? leftOffset : undefined, zIndex: frozen ? 3 : undefined, boxShadow: frozen ? '2px 0 5px -2px rgba(0,0,0,.35)' : undefined }}>
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
      <div
        className="col-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('resizeColumn')}
        onMouseDown={startResize}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', top: 0, right: -4, width: 8, height: '100%', cursor: 'col-resize', zIndex: 3 }}
      />
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
