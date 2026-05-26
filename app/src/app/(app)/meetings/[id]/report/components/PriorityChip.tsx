'use client';

import { useTranslations } from 'next-intl';

/* ─── PriorityChip ──────────────────────────────────────────────── */

export const PRIORITY_MAP: Record<string, { color: string; labelKey: string }> = {
  high: { color: 'var(--red)', labelKey: 'report.priorityHigh' },
  medium: { color: 'var(--amber)', labelKey: 'report.priorityMedium' },
  low: { color: 'var(--muted)', labelKey: 'report.priorityLow' },
};

export function PriorityChip({ priority }: { priority: string }) {
  const tr = useTranslations();
  const p = PRIORITY_MAP[priority] || PRIORITY_MAP.low;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.02em',
        color: p.color,
        background: `color-mix(in oklab, ${p.color} 14%, transparent)`,
        border: `1px solid color-mix(in oklab, ${p.color} 30%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {tr(p.labelKey)}
    </span>
  );
}
