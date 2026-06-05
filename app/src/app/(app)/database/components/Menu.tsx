'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Anchored portal popover menu — closes on outside click / scroll. */
export function PopMenu({ trigger, width = 200, small, label, align = 'right', children }: {
  trigger: ReactNode;
  width?: number;
  small?: boolean;
  label?: string;
  align?: 'left' | 'right';
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); };
  }, [open]);
  return (
    <>
      <button
        ref={ref}
        aria-label={label}
        className="btn btn-ghost btn-icon"
        style={{ width: small ? 24 : 30, height: small ? 24 : 30, color: 'var(--muted)' }}
        onClick={(e) => { e.stopPropagation(); const r = ref.current!.getBoundingClientRect(); setPos({ left: align === 'left' ? r.left : r.right - width, top: r.bottom }); setOpen((o) => !o); }}
      >
        {trigger}
      </button>
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', left: Math.max(pos.left, 8), top: pos.top + 4, width, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 14px 44px rgba(0,0,0,.55)', padding: 6, zIndex: 2000 }}>
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuRow({ icon, label, onClick, danger, disabled }: { icon?: ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: disabled ? 'var(--muted)' : danger ? 'var(--red, #ef4444)' : 'var(--text)', cursor: disabled ? 'default' : 'pointer', fontSize: 13, textAlign: 'left', opacity: disabled ? 0.6 : 1 }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon} {label}
    </button>
  );
}
