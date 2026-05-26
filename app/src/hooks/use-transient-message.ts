'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TransientMessage {
  ok: boolean;
  text: string;
}

/**
 * A status message that auto-clears after a delay. Collapses the repeated
 * `{ ok, text }` state + setTimeout pattern (~8 sites: settings password /
 * invite / SMTP / S3 tests, report send / fix-language, etc.).
 *
 *   const [msg, showMessage] = useTransientMessage();
 *   showMessage(true, t('saved'));   // auto-clears after `ttl` ms
 */
export function useTransientMessage(
  ttl = 4000,
): [TransientMessage | null, (ok: boolean, text: string) => void, () => void] {
  const [msg, setMsg] = useState<TransientMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setMsg(null);
  }, []);

  const showMessage = useCallback(
    (ok: boolean, text: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMsg({ ok, text });
      timer.current = setTimeout(() => setMsg(null), ttl);
    },
    [ttl],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return [msg, showMessage, clear];
}
