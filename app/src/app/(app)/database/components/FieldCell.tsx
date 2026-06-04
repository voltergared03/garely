'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import type { FieldT, OrgMember, SelectChoice } from '../lib/types';
import { PersonPicker } from './PersonPicker';

const cellInput: CSSProperties = {
  width: '100%', height: '100%', border: 'none', background: 'transparent',
  color: 'var(--text)', font: 'inherit', fontSize: 13, padding: '0 10px', outline: 'none',
};

const isoToDateInput = (v: unknown): string => {
  if (typeof v !== 'string' || !v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const enterBlur = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
};

/** One editable cell, rendered per field type. `onCommit(value)` persists; an
 *  empty value clears the cell (server drops the key). */
export function FieldCell({
  field,
  value,
  members,
  onCommit,
}: {
  field: FieldT;
  value: unknown;
  members: OrgMember[];
  onCommit: (value: unknown) => void;
}) {
  switch (field.type) {
    case 'text':
    case 'longText':
      return (
        <input
          style={cellInput}
          defaultValue={typeof value === 'string' ? value : ''}
          key={String(value ?? '')}
          onBlur={(e) => { if (e.target.value !== (value ?? '')) onCommit(e.target.value); }}
          onKeyDown={enterBlur}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          style={cellInput}
          defaultValue={typeof value === 'number' ? String(value) : ''}
          key={String(value ?? '')}
          onBlur={(e) => {
            const v = e.target.value === '' ? '' : Number(e.target.value);
            if (v !== (value ?? '')) onCommit(v === '' ? '' : v);
          }}
          onKeyDown={enterBlur}
        />
      );
    case 'checkbox':
      return (
        <button
          type="button"
          onClick={() => onCommit(!value)}
          style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-pressed={!!value}
        >
          <span
            style={{
              width: 18, height: 18, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${value ? 'var(--accent)' : 'var(--border-2, var(--border))'}`,
              background: value ? 'var(--accent)' : 'transparent',
            }}
          >
            {value ? <Check size={13} style={{ color: '#fff' }} /> : null}
          </span>
        </button>
      );
    case 'date':
      return (
        <input
          type="date"
          style={cellInput}
          defaultValue={isoToDateInput(value)}
          key={isoToDateInput(value)}
          onChange={(e) => onCommit(e.target.value || '')}
        />
      );
    case 'singleSelect':
    case 'multiSelect':
      return (
        <ChoiceCell
          choices={field.options?.choices ?? []}
          value={value}
          multiple={field.type === 'multiSelect'}
          onCommit={onCommit}
        />
      );
    case 'person':
      return (
        <PersonPicker
          members={members}
          value={value}
          multiple={!!field.options?.multiple}
          onCommit={onCommit}
        />
      );
    default:
      return null;
  }
}

function Chip({ choice }: { choice: SelectChoice }) {
  const c = choice.color || 'var(--surface-3)';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '2px 9px', fontSize: 12,
        background: `color-mix(in oklab, ${c} 22%, transparent)`,
        color: 'var(--text)', border: `1px solid color-mix(in oklab, ${c} 40%, transparent)`,
        maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      {choice.name}
    </span>
  );
}

function ChoiceCell({
  choices,
  value,
  multiple,
  onCommit,
}: {
  choices: SelectChoice[];
  value: unknown;
  multiple: boolean;
  onCommit: (v: string | string[] | null) => void;
}) {
  const ids = Array.isArray(value)
    ? (value.filter((v) => typeof v === 'string') as string[])
    : typeof value === 'string' && value
      ? [value]
      : [];
  const byId = new Map(choices.map((c) => [c.id, c]));
  const selected = ids.map((id) => byId.get(id)).filter(Boolean) as SelectChoice[];

  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current && !btnRef.current.contains(target) && panelRef.current && !panelRef.current.contains(target)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom, width: r.width });
    }
    setOpen((o) => !o);
  };

  const pick = (id: string) => {
    if (multiple) {
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      onCommit(next.length ? next : null);
    } else {
      onCommit(ids[0] === id ? null : id);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={toggle}
        style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, padding: '0 8px', cursor: 'pointer', overflow: 'hidden' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', flexWrap: 'nowrap' }}>
          {selected.map((c) => <Chip key={c.id} choice={c} />)}
        </span>
        <ChevronDown size={13} style={{ color: 'var(--muted)', flexShrink: 0, opacity: 0.6 }} />
      </button>

      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed', left: pos.left, top: pos.top + 4, width: Math.max(pos.width, 180),
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 12px 40px rgba(0,0,0,.5)', padding: 4, zIndex: 2000, maxHeight: 280, overflowY: 'auto',
            }}
          >
            {choices.length === 0 && <div style={{ padding: 10, color: 'var(--muted)', fontSize: 12 }}>—</div>}
            {choices.map((c) => {
              const sel = ids.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', border: 'none', borderRadius: 7, background: sel ? 'var(--surface-2)' : 'transparent', cursor: 'pointer' }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ flex: 1, display: 'flex' }}><Chip choice={c} /></span>
                  {sel && <Check size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
