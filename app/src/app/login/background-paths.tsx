'use client';

// Animated "flowing paths" backdrop for the login screen. Adapted from a
// framer-motion concept to EZmeet's stack: pure SVG + CSS animation (no extra
// deps), dark-theme + accent-tinted, decorative only (pointer-events-none,
// aria-hidden), and it honours prefers-reduced-motion (see .login-bg-path in
// globals.css). Path durations/delays are index-derived → SSR-safe (no random).

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    // px (non-scaling stroke) so lines stay hair-thin regardless of viewport scale
    width: 0.3 + i * 0.016,
    opacity: Math.min(0.04 + i * 0.008, 0.18),
    dur: 20 + (i % 13), // 20–32s, out of sync
    delay: -(i % 9), // negative → already mid-flight on first paint
  }));

  return (
    <svg
      viewBox="0 0 696 316"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', color: 'color-mix(in oklab, var(--accent) 55%, #ffffff)' }}
    >
      {paths.map((p) => (
        <path
          key={p.id}
          className="login-bg-path"
          d={p.d}
          stroke="currentColor"
          strokeWidth={p.width}
          strokeOpacity={p.opacity}
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          style={{ ['--bp-dur' as string]: `${p.dur}s`, ['--bp-delay' as string]: `${p.delay}s` } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}

export function BackgroundPaths() {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <FloatingPaths position={1} />
      <FloatingPaths position={-1} />
    </div>
  );
}
