'use client';

import { useState, useEffect } from 'react';

// Workspace IANA timezone for client-side date/time rendering. Fetched once and
// cached for the session; falls back to Europe/Kyiv until loaded. Use so pages
// render in the workspace zone instead of the browser's.
let cached: string | null = null;

export function useWorkspaceTz(): string {
  const [tz, setTz] = useState<string>(cached || 'Europe/Kyiv');
  useEffect(() => {
    if (cached) {
      setTz(cached);
      return;
    }
    let alive = true;
    fetch('/api/workspace/tz')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.tz && alive) {
          cached = d.tz;
          setTz(d.tz);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return tz;
}
