'use client';

import React from 'react';

/* ─── ReportCard ────────────────────────────────────────────────── */

export function ReportCard({
  icon: Icon,
  title,
  accentColor,
  badge,
  actions,
  children,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  accentColor: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: `color-mix(in oklab, ${accentColor} 16%, transparent)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={15} style={{ color: accentColor }} />
          </div>
          <span style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap' }}>{title}</span>
          {badge}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{actions}</div>}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}
