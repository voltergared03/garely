import { describe, it, expect } from 'vitest';
import { LOCALES, DEFAULT_LOCALE, LOCALE_LABELS, isLocale } from '@/i18n/locales';

describe('locale helpers', () => {
  it('isLocale accepts supported locales only', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('uk')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });

  it('English is the system default locale', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('supports en + uk with autonym labels', () => {
    expect([...LOCALES].sort()).toEqual(['en', 'uk']);
    expect(LOCALE_LABELS.en).toBe('English');
    expect(LOCALE_LABELS.uk).toBe('Українська');
  });
});
