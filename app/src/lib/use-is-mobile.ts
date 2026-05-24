'use client';

import { useState, useEffect } from 'react';

/**
 * True on phone-width viewports (<768px by default), matching the app's mobile
 * breakpoint. SSR-safe: starts `false` (so server and first client render agree)
 * and updates on mount, so it's only used to swap layout in client components
 * where the content isn't server-rendered with data.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);
  return isMobile;
}
