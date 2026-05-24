'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from '@/i18n/locales';

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(name + '='))
    ?.split('=')[1];
}

/**
 * Keeps the `locale` cookie (which drives server-side rendering language) in
 * step with the signed-in user's saved preference. Runs once after login: if the
 * cookie doesn't match the user's preference, it writes the cookie and refreshes
 * so the whole app re-renders in their language. Existing users (stamped 'uk')
 * therefore stay Ukrainian even though the system default is English.
 */
export function LocaleSync() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    const pref = (session?.user as any)?.locale;
    if (!isLocale(pref)) return;
    if (readCookie(LOCALE_COOKIE) === pref) return;
    document.cookie = `${LOCALE_COOKIE}=${pref}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    router.refresh();
  }, [session, router]);

  return null;
}
