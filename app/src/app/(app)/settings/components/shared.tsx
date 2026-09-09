'use client';

import { Field } from '@/components/ui/field';

/* ── Shared UI ────────────────────────────────── */

export { Toggle } from '@/components/ui/toggle';

/**
 * Kept as a name so the ~12 files importing it here do not all have to change at
 * once, but it is now the shared <Field> underneath — which means every one of those
 * call sites can pass `error` and get an inline, screen-reader-announced message
 * without any further migration. New code should import Field directly.
 */
export function FieldWrapper({
  label, hint, error, required, children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
}) {
  return <Field label={label} hint={hint} error={error} required={required}>{children}</Field>;
}

export function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3 }}>{value}</div>
    </div>
  );
}

export function UsageRow({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ color: 'var(--text-2)' }}>{label}</span>
        <span className="mono" style={{ color: 'var(--muted)' }}>{value}</span>
      </div>
      <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
      </div>
    </div>
  );
}
