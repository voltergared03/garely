import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './locales';

/**
 * Resolve the active UI locale for this request:
 *   1. `locale` cookie (set by the settings switcher / LocaleSync) — user choice
 *   2. workspace default language (WS_LANGUAGE) — admin-configured, also covers
 *      anonymous pages like /login before any per-user cookie exists
 *   3. DEFAULT_LOCALE ('en') — hard fallback (also at build time when DB is down)
 */
export default getRequestConfig(async () => {
  let locale: Locale = DEFAULT_LOCALE;
  try {
    const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(cookieLocale)) {
      locale = cookieLocale;
    } else {
      const cfg = await readConfig(['WS_LANGUAGE']);
      const ws = cfg.WS_LANGUAGE || CONFIG_DEFAULTS.WS_LANGUAGE;
      locale = isLocale(ws) ? ws : DEFAULT_LOCALE;
    }
  } catch {
    locale = DEFAULT_LOCALE;
  }

  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
