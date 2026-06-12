import { describe, it, expect } from 'vitest';
import { shouldReopenOnReschedule } from './meeting-lifecycle';

const D = (s: string) => new Date(s);

describe('shouldReopenOnReschedule', () => {
  const base = {
    currentStatus: 'ended',
    statusExplicitlySet: false,
    newScheduledAt: D('2026-06-12T13:45:00Z'),
    scheduledAtChanged: true,
    hasRealContent: false,
  };

  it('re-opens an ended meeting whose time is being moved, with no real content', () => {
    // The exact bug: overdue meeting briefly opened → ended, then rescheduled.
    expect(shouldReopenOnReschedule(base)).toBe(true);
  });

  it('re-opens a cancelled meeting moved to a new time too', () => {
    expect(shouldReopenOnReschedule({ ...base, currentStatus: 'cancelled' })).toBe(true);
  });

  it('re-opens regardless of whether the new time is past or future', () => {
    // A never-happened meeting moved to ANY new time hasn't happened yet.
    expect(shouldReopenOnReschedule({ ...base, newScheduledAt: D('2026-06-12T11:00:00Z') })).toBe(true);
  });

  it('does NOT re-open when scheduledAt is not actually changing', () => {
    expect(shouldReopenOnReschedule({ ...base, scheduledAtChanged: false })).toBe(false);
  });

  it('does NOT re-open when scheduledAt is cleared (no time to reopen to)', () => {
    expect(shouldReopenOnReschedule({ ...base, newScheduledAt: null })).toBe(false);
  });

  it('does NOT re-open a live or already-scheduled meeting', () => {
    expect(shouldReopenOnReschedule({ ...base, currentStatus: 'live' })).toBe(false);
    expect(shouldReopenOnReschedule({ ...base, currentStatus: 'scheduled' })).toBe(false);
  });

  it('does NOT discard a meeting that produced real content (report/transcript)', () => {
    expect(shouldReopenOnReschedule({ ...base, hasRealContent: true })).toBe(false);
  });

  it('respects an explicit status in the request (caller intent wins)', () => {
    expect(shouldReopenOnReschedule({ ...base, statusExplicitlySet: true })).toBe(false);
  });
});
