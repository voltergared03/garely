'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, UserPlus } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import type { OrgMember } from '../lib/types';

const asIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? (value.filter((v) => typeof v === 'string') as string[])
    : typeof value === 'string' && value
      ? [value]
      : [];

/** A cell-friendly person selector. Shows selected avatars; click opens a
 *  portal dropdown of org members to toggle. Single or multiple per `multiple`. */
export function PersonPicker({
  members,
  value,
  multiple,
  onCommit,
}: {
  members: OrgMember[];
  value: unknown;
  multiple?: boolean;
  onCommit: (v: string | string[] | null) => void;
}) {
  const ids = asIds(value);
  const byId = new Map(members.map((m) => [m.id, m]));
  const selected = ids.map((id) => byId.get(id)).filter(Boolean) as OrgMember[];

  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current && !btnRef.current.contains(target) && panelRef.current && !panelRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
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

  const cellBtn: CSSProperties = {
    width: '100%', height: '100%', border: 'none', background: 'transparent',
    display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px', cursor: 'pointer',
    color: 'var(--text)', overflow: 'hidden', minWidth: 0,
  };

  return (
    <>
      <button type="button" ref={btnRef} onClick={toggle} style={cellBtn}>
        {selected.length === 0 ? (
          <span style={{ color: 'var(--muted-2, var(--muted))', display: 'inline-flex' }}>
            <UserPlus size={14} />
          </span>
        ) : (
          selected.map((m) => (
            <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--surface-2)', borderRadius: 999, padding: '2px 8px 2px 2px', maxWidth: 140 }}>
              <Avatar name={m.name || m.email || '?'} image={m.image} size="sm" />
              <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name || m.email}
              </span>
            </span>
          ))
        )}
      </button>

      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed', left: pos.left, top: pos.top + 4, width: Math.max(pos.width, 200),
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 12px 40px rgba(0,0,0,.5)', padding: 4, zIndex: 2000, maxHeight: 280, overflowY: 'auto',
            }}
          >
            {members.length === 0 && (
              <div style={{ padding: 10, color: 'var(--muted)', fontSize: 12 }}>—</div>
            )}
            {members.map((m) => {
              const sel = ids.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pick(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px',
                    border: 'none', borderRadius: 7, background: sel ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'transparent',
                    color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Avatar name={m.name || m.email || '?'} image={m.image} size="sm" />
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name || m.email}
                  </span>
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
