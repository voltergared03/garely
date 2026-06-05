/**
 * Date-field reminders — pure window math (unit-tested), used by the
 * `/api/cron/base-reminders` job. A reminder fires once when "now" enters the
 * window `[dueDate - daysBefore, dueDate)`; the cron dedups firing via the
 * BaseDateReminder table so it never re-sends (and survives a missed cron day /
 * a date set inside the window).
 */

/** Truncate a date to its UTC calendar day (the idempotency key for a reminder). */
export function reminderDueOn(due: Date): Date {
  return new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()));
}

/** True when `now` is within `[dueDate - daysBefore, dueDate)` for the cell's date. */
export function isInReminderWindow(cell: unknown, daysBefore: number, now: Date): boolean {
  if (typeof cell !== 'string' || !cell) return false;
  if (!Number.isFinite(daysBefore) || daysBefore <= 0) return false;
  const due = new Date(cell);
  if (isNaN(due.getTime())) return false;
  const t = now.getTime();
  return t >= due.getTime() - daysBefore * 86_400_000 && t < due.getTime();
}
