'use client';

import { useEffect, useState } from 'react';

// Module-cached so the badge renders instantly on navigation; refreshed on mount.
let cached: number | null = null;

/** Count of the current user's not-yet-completed quiz assignments (for the nav badge). */
export function useQuizPending(): number {
  const [n, setN] = useState(cached ?? 0);

  useEffect(() => {
    let alive = true;
    fetch('/api/quiz')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const c = Array.isArray(d) ? d.filter((x: any) => x?.status !== 'completed').length : 0;
        cached = c;
        if (alive) setN(c);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return n;
}
