import { describe, it, expect } from 'vitest';
import {
  pad,
  fmtTime,
  dayDiff,
  isToday,
  fmtDateLong,
  fmtRelative,
  getInitials,
  getAvatarColor,
  generateMeetingSlug,
  AVATAR_COLORS,
} from '@/lib/utils';

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

describe('pad / fmtTime', () => {
  it('pads single digits', () => {
    expect(pad(5)).toBe('05');
    expect(pad(12)).toBe('12');
  });
  it('formats 24h time', () => {
    expect(fmtTime(new Date(2026, 0, 1, 9, 5))).toBe('09:05');
    expect(fmtTime(new Date(2026, 0, 1, 18, 30))).toBe('18:30');
  });
});

describe('dayDiff / isToday', () => {
  it('is string-independent and time-of-day robust', () => {
    expect(dayDiff(new Date())).toBe(0);
    expect(dayDiff(daysFromNow(1))).toBe(1);
    expect(dayDiff(daysFromNow(-1))).toBe(-1);
    expect(isToday(new Date())).toBe(true);
    expect(isToday(daysFromNow(1))).toBe(false);
  });
});

describe('fmtDateLong (locale-aware)', () => {
  const may24 = new Date(2026, 4, 24);
  it('formats English (month + day)', () => {
    expect(fmtDateLong(may24, 'en')).toBe('May 24');
  });
  it('formats Ukrainian (genitive month)', () => {
    expect(fmtDateLong(may24, 'uk')).toBe('24 травня');
  });
});

describe('fmtRelative (locale-aware relative day)', () => {
  it('English today/tomorrow/yesterday', () => {
    expect(fmtRelative(new Date(), 'en')).toBe('Today');
    expect(fmtRelative(daysFromNow(1), 'en')).toBe('Tomorrow');
    expect(fmtRelative(daysFromNow(-1), 'en')).toBe('Yesterday');
  });
  it('Ukrainian today/tomorrow/yesterday', () => {
    expect(fmtRelative(new Date(), 'uk')).toBe('Сьогодні');
    expect(fmtRelative(daysFromNow(1), 'uk')).toBe('Завтра');
    // CLDR Ukrainian uses the у/в-alternation form "учора" for -1 day.
    expect(fmtRelative(daysFromNow(-1), 'uk')).toBe('Учора');
  });
  it('falls back to a long date far out', () => {
    const d = daysFromNow(30);
    expect(fmtRelative(d, 'en')).toBe(fmtDateLong(d, 'en'));
  });
});

describe('avatar helpers', () => {
  it('derives up to two initials, uppercased', () => {
    expect(getInitials('John Doe')).toBe('JD');
    expect(getInitials('alice')).toBe('A');
    expect(getInitials('a b c')).toBe('AB');
  });
  it('picks a deterministic colour from the palette', () => {
    expect(getAvatarColor('John')).toBe(getAvatarColor('John'));
    expect(AVATAR_COLORS).toContain(getAvatarColor('John'));
  });
});

describe('generateMeetingSlug', () => {
  it('produces a 4-4-3 lowercase alphanumeric slug', () => {
    expect(generateMeetingSlug()).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{3}$/);
  });
});
