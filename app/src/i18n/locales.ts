// Shared locale constants. No server-only deps so this is safe to import from
// both client and server code (settings switcher, LocaleSync, request config).

export const LOCALES = ['en', 'uk'] as const;
export type Locale = (typeof LOCALES)[number];

// English is the system default (Ukrainian stays available as an opt-in).
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_COOKIE = 'locale';
// 1 year — the cookie just remembers the chosen UI language.
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  uk: 'Українська',
};
