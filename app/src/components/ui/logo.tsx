'use client';

export function Logo({ size = 18, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <div
        style={{
          width: size + 6,
          height: size + 6,
          borderRadius: 9,
          background: 'linear-gradient(135deg, var(--accent), #6ea8ff)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 20px -6px var(--accent-soft), inset 0 1px 0 rgba(255,255,255,.25)',
        }}
      >
        <svg
          width={size - 3}
          height={size - 3}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="4" width="9" height="9" rx="2.5" />
          <rect x="11" y="11" width="9" height="9" rx="2.5" />
        </svg>
      </div>
      {withText && (
        <div style={{ fontWeight: 700, letterSpacing: '-0.01em', fontSize: 15 }}>
          Gare<span style={{ color: 'var(--muted)', fontWeight: 500 }}>ly</span>
        </div>
      )}
    </div>
  );
}
