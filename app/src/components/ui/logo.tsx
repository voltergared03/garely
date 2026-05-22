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
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="6" width="14" height="12" rx="2.5" />
          <path d="m22 8-6 4 6 4z" />
        </svg>
      </div>
      {withText && (
        <div style={{ fontWeight: 700, letterSpacing: '-0.01em', fontSize: 15 }}>
          EAM <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Meet</span>
        </div>
      )}
    </div>
  );
}
