'use client';

/**
 * `beforeinstallprompt` fires once and won't refire, so we capture it at the
 * root (PwaRegister) and stash it here. An install button mounted later (e.g.
 * the dashboard card) can still trigger it. Also exposes installed/platform
 * helpers for deciding whether to show an install affordance at all.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Attach the global listeners once. Safe to call repeatedly. */
export function initInstallCapture() {
  if (typeof window === 'undefined') return;
  if ((window as any).__eamInstallCaptureInit) return;
  (window as any).__eamInstallCaptureInit = true;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export async function triggerInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    emit();
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Already running as an installed app? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

/** iOS / iPadOS (where install is a manual "Add to Home Screen" in Safari). */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const iOSUA = /iphone|ipad|ipod/i.test(ua);
  const iPadOS =
    navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1;
  return iOSUA || iPadOS;
}
