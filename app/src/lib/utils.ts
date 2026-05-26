import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Calendar fields (Y/M/D/H/M) for an instant as seen in a specific IANA time
// zone. The server runs in UTC but the browser renders in the viewer's zone, so
// the same instant produces different wall-clock text on each side — that
// disagreement is what makes React throw a #418 hydration mismatch. Formatting
// against a fixed zone (the workspace tz) makes both sides render identically.
function zonedParts(d: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(d)) p[part.type] = part.value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour % 24, // some environments emit "24" for midnight
    minute: +p.minute,
  };
}

/** Hour-of-day (0–23) for an instant in the given IANA time zone. */
export function zonedHour(d: Date, tz: string): number {
  try {
    return zonedParts(d, tz).hour;
  } catch {
    return d.getHours();
  }
}

export function fmtTime(d: Date, tz?: string): string {
  if (tz) {
    try {
      const { hour, minute } = zonedParts(d, tz);
      return `${pad(hour)}:${pad(minute)}`;
    } catch {
      /* invalid tz → fall through to runtime-local */
    }
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** UTC-midnight proxy for the calendar date of `d` as seen in `tz`. */
function zonedDayProxy(d: Date, tz: string): number {
  const { year, month, day } = zonedParts(d, tz);
  return Date.UTC(year, month - 1, day);
}

/**
 * Whole-day offset from today (0 = today, 1 = tomorrow, -1 = yesterday).
 * Pass `tz` to compute the offset in a fixed zone (and `now` to pin the
 * reference instant) so server and client agree — otherwise both default to
 * the runtime's local zone and current time, as before.
 */
export function dayDiff(d: Date, tz?: string, now: Date = new Date()): number {
  if (tz) {
    try {
      return Math.round((zonedDayProxy(d, tz) - zonedDayProxy(now, tz)) / 86400000);
    } catch {
      /* invalid tz → fall through */
    }
  }
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return Math.round((day.getTime() - today.getTime()) / 86400000);
}

/** String-independent "is this date today?" — use for logic, never compare formatted labels. */
export function isToday(d: Date, tz?: string, now?: Date): boolean {
  return dayDiff(d, tz, now) === 0;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// `locale` defaults to 'uk' so existing call sites keep their behaviour until
// they're swept to pass the active UI locale. Pass `tz` to format against a
// fixed zone (keeps SSR and hydration in agreement).
export function fmtDateLong(d: Date, locale: string = 'uk', tz?: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    ...(tz ? { timeZone: tz } : {}),
  }).format(d);
}

export function fmtRelative(d: Date, locale: string = 'uk', tz?: string, now?: Date): string {
  const diff = dayDiff(d, tz, now);
  if (diff >= -1 && diff <= 1) {
    return capitalize(new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(diff, 'day'));
  }
  if (diff > 1 && diff < 7) {
    return capitalize(
      new Intl.DateTimeFormat(locale, { weekday: 'long', ...(tz ? { timeZone: tz } : {}) }).format(d)
    );
  }
  return fmtDateLong(d, locale, tz);
}

export function generateMeetingSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const segments = [4, 4, 3].map((len) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  );
  return segments.join('-');
}

export const AVATAR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ec4899',
  '#a78bfa', '#14b8a6', '#ef4444', '#f97316',
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
