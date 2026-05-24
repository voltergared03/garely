import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Whole-day offset from today (0 = today, 1 = tomorrow, -1 = yesterday). */
export function dayDiff(d: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return Math.round((day.getTime() - today.getTime()) / 86400000);
}

/** String-independent "is this date today?" — use for logic, never compare formatted labels. */
export function isToday(d: Date): boolean {
  return dayDiff(d) === 0;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// `locale` defaults to 'uk' so existing call sites keep their behaviour until
// they're swept to pass the active UI locale.
export function fmtDateLong(d: Date, locale: string = 'uk'): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(d);
}

export function fmtRelative(d: Date, locale: string = 'uk'): string {
  const diff = dayDiff(d);
  if (diff >= -1 && diff <= 1) {
    return capitalize(new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(diff, 'day'));
  }
  if (diff > 1 && diff < 7) {
    return capitalize(new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d));
  }
  return fmtDateLong(d, locale);
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
