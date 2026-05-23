'use client';

import { useEffect } from 'react';
import { initInstallCapture } from '@/lib/pwa-install';

/**
 * Registers the service worker once, after load, on every page. Mounted in the
 * root layout. Safe no-op where service workers aren't supported. Also starts
 * capturing the install prompt so the dashboard card can trigger it later.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Start listening for `beforeinstallprompt` ASAP (fires once, won't refire).
    initInstallCapture();

    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[pwa] service worker registration failed:', err);
      });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
