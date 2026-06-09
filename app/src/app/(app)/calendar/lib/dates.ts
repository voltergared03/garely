import { pad } from '@/lib/utils';
import type { Meeting, CalTask } from './types';

export function eventAccent(m: Meeting): string {
  // Past history reads greyed-out; a live meeting is always green; future
  // (incl. recurring) keeps its colour.
  if (m.status === 'ended' || m.status === 'cancelled') return 'var(--muted)';
  if (m.status === 'live') return 'var(--green)';
  if (m.scheduledAt && new Date(m.scheduledAt).getTime() < Date.now()) return 'var(--muted)';
  if (m.recurrence) return 'var(--accent)';
  return 'var(--green)';
}

// Task deadlines are coloured by priority so urgency reads at a glance.
export function taskAccent(priority: string): string {
  if (priority === 'high') return 'var(--red)';
  if (priority === 'low') return 'var(--muted)';
  return 'var(--amber)';
}

/** Group task deadlines by day (YYYY-MM-DD) for calendar placement. */
export function tasksByDayMap(tasks: CalTask[]): Record<string, CalTask[]> {
  const map: Record<string, CalTask[]> = {};
  for (const tk of tasks) {
    if (!tk.dueDate) continue;
    const key = dateKey(new Date(tk.dueDate));
    (map[key] ||= []).push(tk);
  }
  return map;
}

export function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getParticipantNames(m: Meeting) {
  return m.participants.map((p) => ({
    name: p.user?.name || p.guestName || 'Guest',
    image: p.user?.image || null,
  }));
}

export function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const dayOfWeek = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(start.getDate() - dayOfWeek);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}
