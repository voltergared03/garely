import { describe, it, expect } from 'vitest';
import { buildCalendar, googleCalendarUrl } from '@/lib/ics';

const d = (s: string) => new Date(s);

describe('buildCalendar', () => {
  it('emits a VCALENDAR skeleton with CRLF endings', () => {
    const ics = buildCalendar({ name: 'Test', events: [] });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('renders a timed event with UTC stamps and escapes ; and ,', () => {
    const ics = buildCalendar({
      name: 'C',
      events: [{ uid: 'm1@x', start: d('2026-06-10T09:00:00Z'), end: d('2026-06-10T09:30:00Z'), summary: 'Plan; review, stuff', location: 'https://x/room/1' }],
    });
    expect(ics).toContain('UID:m1@x');
    expect(ics).toContain('DTSTART:20260610T090000Z');
    expect(ics).toContain('DTEND:20260610T093000Z');
    expect(ics).toContain('SUMMARY:Plan\\; review\\, stuff');
  });

  it('renders an all-day event with VALUE=DATE and an exclusive (+1 day) end', () => {
    const ics = buildCalendar({
      name: 'C',
      events: [{ uid: 't1@x', start: d('2026-06-10T00:00:00Z'), allDay: true, summary: 'Deadline' }],
    });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260610');
    expect(ics).toContain('DTEND;VALUE=DATE:20260611');
  });

  it('folds long Cyrillic lines to ≤75 octets without splitting a char', () => {
    const long = 'Дуже довга назва зустрічі про синхронізацію календаря '.repeat(4).trim();
    const ics = buildCalendar({ name: 'C', events: [{ uid: 'a@x', start: d('2026-06-10T09:00:00Z'), summary: long }] });
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    // folded content is still recoverable (unfold = strip CRLF + leading space)
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:${long}`);
  });
});

describe('buildCalendar — invites + google url', () => {
  it('emits METHOD:REQUEST with ORGANIZER, ATTENDEE, SEQUENCE, STATUS', () => {
    const ics = buildCalendar({
      name: 'M',
      method: 'REQUEST',
      events: [{
        uid: 'meeting-x@ezmeet',
        start: d('2026-06-10T09:00:00Z'),
        end: d('2026-06-10T10:00:00Z'),
        summary: 'Sync',
        sequence: 0,
        status: 'CONFIRMED',
        organizer: { email: 'host@x', name: 'Host' },
        attendees: [{ email: 'a@x', name: 'Aa' }, { email: 'b@x' }],
      }],
    });
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('SEQUENCE:0');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('ORGANIZER;CN="Host":mailto:host@x');
    // ATTENDEE lines exceed 75 octets with the standard params → they fold
    // (RFC5545, valid); unfold (CRLF + leading space) before matching.
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="Aa":mailto:a@x');
    expect(unfolded).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:b@x');
  });

  it('googleCalendarUrl builds a render link with UTC dates', () => {
    const url = googleCalendarUrl({ title: 'Sync', start: d('2026-06-10T09:00:00Z'), end: d('2026-06-10T10:00:00Z'), location: 'https://x/room/1' });
    expect(url).toContain('https://calendar.google.com/calendar/render');
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('dates=20260610T090000Z%2F20260610T100000Z');
  });
});
