import { describe, it, expect } from 'vitest';
import { isInReminderWindow, reminderDueOn } from './base-reminders';

const D = (s: string) => new Date(s);

describe('isInReminderWindow', () => {
  const due = '2026-06-10T00:00:00.000Z';
  it('fires inside [due - daysBefore, due)', () => {
    expect(isInReminderWindow(due, 3, D('2026-06-07T08:00:00Z'))).toBe(true); // exactly 3 days before
    expect(isInReminderWindow(due, 3, D('2026-06-08T23:00:00Z'))).toBe(true); // still in window
    expect(isInReminderWindow(due, 3, D('2026-06-09T12:00:00Z'))).toBe(true); // day before, still in
  });
  it('does not fire before the window opens, at the due moment, or after', () => {
    expect(isInReminderWindow(due, 3, D('2026-06-06T12:00:00Z'))).toBe(false); // 4 days out
    expect(isInReminderWindow(due, 3, D('2026-06-10T00:00:00Z'))).toBe(false); // at due
    expect(isInReminderWindow(due, 3, D('2026-06-11T00:00:00Z'))).toBe(false); // past
  });
  it('fires for a date SET inside the window', () => {
    expect(isInReminderWindow('2026-06-10', 3, D('2026-06-09T10:00:00Z'))).toBe(true);
  });
  it('rejects junk / non-positive daysBefore', () => {
    expect(isInReminderWindow('', 3, D('2026-06-07T00:00:00Z'))).toBe(false);
    expect(isInReminderWindow('not-a-date', 3, D('2026-06-07T00:00:00Z'))).toBe(false);
    expect(isInReminderWindow(due, 0, D('2026-06-07T00:00:00Z'))).toBe(false);
    expect(isInReminderWindow(undefined, 3, D('2026-06-07T00:00:00Z'))).toBe(false);
  });
});

describe('reminderDueOn', () => {
  it('truncates to the UTC calendar day', () => {
    expect(reminderDueOn(D('2026-06-10T14:30:00Z')).toISOString()).toBe('2026-06-10T00:00:00.000Z');
  });
});
