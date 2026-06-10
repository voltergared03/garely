import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { gcalFetch } from '@/lib/google-calendar';
import { syncConnection, syncMeetingToGoogle } from '@/lib/calendar-sync';

vi.mock('@/lib/prisma');
vi.mock('@/lib/google-calendar', () => ({ gcalFetch: vi.fn() }));
vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(async () => ({})),
  num: vi.fn(() => 240),
  publicBaseUrl: vi.fn(async () => 'https://meet.example.com'),
}));

const mockFetch = vi.mocked(gcalFetch);

const conn = (over: Record<string, unknown> = {}) => ({
  id: 'gc1', userId: 'u1', orgId: 'org1', calendarId: 'cal1', status: 'active',
  syncToken: null, channelId: null, resourceId: null, channelToken: null,
  channelExpiry: null, ...over,
}) as any;

const ok = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

beforeEach(() => {
  mockReset(prismaMock);
  mockFetch.mockReset();
});

describe('syncConnection (Google → Garely)', () => {
  it('creates a meeting from a new timed event and patches the join link back', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({
        items: [{
          id: 'ev1', etag: '"e1"', status: 'confirmed', summary: 'Planning',
          start: { dateTime: '2026-06-15T10:00:00+03:00' },
          end: { dateTime: '2026-06-15T11:00:00+03:00' },
        }],
        nextSyncToken: 'st-new',
      }))
      // PATCH join link back into the event
      .mockResolvedValueOnce(ok({ etag: '"e2"' }));

    prismaMock.meeting.findFirst.mockResolvedValue(null as any);
    prismaMock.meeting.create.mockResolvedValue({ id: 'm1' } as any);
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', joinToken: 'tok1' } as any);
    prismaMock.user.findMany.mockResolvedValue([] as any);

    const res = await syncConnection(conn());
    expect(res.created).toBe(1);
    const createArgs = prismaMock.meeting.create.mock.calls[0][0] as any;
    expect(createArgs.data.title).toBe('Planning');
    expect(createArgs.data.externalId).toBe('ev1');
    expect(createArgs.data.durationMin).toBe(60);
    expect(createArgs.data.joinToken).toBeTruthy();
    // join-link patch went to the right event
    expect(mockFetch.mock.calls[1][1]).toContain('/events/ev1');
    // fresh sync token persisted
    const connUpdate = prismaMock.googleCalendarConnection.update.mock.calls.at(-1)![0] as any;
    expect(connUpdate.data.syncToken).toBe('st-new');
  });

  it('skips an event whose etag matches what we stored (our own write)', async () => {
    mockFetch.mockResolvedValueOnce(ok({
      items: [{ id: 'ev1', etag: '"same"', status: 'confirmed', start: { dateTime: '2026-06-15T10:00:00Z' } }],
      nextSyncToken: 'st',
    }));
    prismaMock.meeting.findFirst.mockResolvedValue({ id: 'm1', externalEtag: '"same"', status: 'scheduled' } as any);
    const res = await syncConnection(conn());
    expect(res.skipped).toBe(1);
    expect(prismaMock.meeting.update).not.toHaveBeenCalled();
  });

  it('cancels the meeting when the event is deleted in Google', async () => {
    mockFetch.mockResolvedValueOnce(ok({
      items: [{ id: 'ev1', etag: '"e3"', status: 'cancelled' }],
      nextSyncToken: 'st',
    }));
    prismaMock.meeting.findFirst.mockResolvedValue({ id: 'm1', externalEtag: '"old"', status: 'scheduled' } as any);
    const res = await syncConnection(conn());
    expect(res.cancelled).toBe(1);
    const upd = prismaMock.meeting.update.mock.calls[0][0] as any;
    expect(upd.data.status).toBe('cancelled');
  });

  it('never cancels a meeting that already ran (reports survive cleanup)', async () => {
    mockFetch.mockResolvedValueOnce(ok({
      items: [{ id: 'ev1', etag: '"e3"', status: 'cancelled' }],
      nextSyncToken: 'st',
    }));
    prismaMock.meeting.findFirst.mockResolvedValue({ id: 'm1', externalEtag: '"old"', status: 'ended' } as any);
    const res = await syncConnection(conn());
    expect(res.skipped).toBe(1);
    expect(prismaMock.meeting.update).not.toHaveBeenCalled();
  });

  it('skips all-day events and recurring masters', async () => {
    mockFetch.mockResolvedValueOnce(ok({
      items: [
        { id: 'allday', etag: '"a"', status: 'confirmed', start: { date: '2026-06-15' } },
        { id: 'recur', etag: '"r"', status: 'confirmed', start: { dateTime: '2026-06-15T10:00:00Z' }, recurrence: ['RRULE:FREQ=WEEKLY'] },
      ],
      nextSyncToken: 'st',
    }));
    prismaMock.meeting.findFirst.mockResolvedValue(null as any);
    const res = await syncConnection(conn());
    expect(res.skipped).toBe(2);
    expect(prismaMock.meeting.create).not.toHaveBeenCalled();
  });

  it('updates title/time on an etag change', async () => {
    mockFetch.mockResolvedValueOnce(ok({
      items: [{
        id: 'ev1', etag: '"new"', status: 'confirmed', summary: 'Renamed',
        start: { dateTime: '2026-06-16T12:00:00Z' }, end: { dateTime: '2026-06-16T12:30:00Z' },
      }],
      nextSyncToken: 'st',
    }));
    prismaMock.meeting.findFirst.mockResolvedValue({ id: 'm1', externalEtag: '"old"', status: 'scheduled' } as any);
    prismaMock.user.findMany.mockResolvedValue([] as any);
    const res = await syncConnection(conn());
    expect(res.updated).toBe(1);
    const upd = prismaMock.meeting.update.mock.calls[0][0] as any;
    expect(upd.data.title).toBe('Renamed');
    expect(upd.data.durationMin).toBe(30);
  });
});

describe('syncMeetingToGoogle (Garely → Google)', () => {
  const meeting = (over: Record<string, unknown> = {}) => ({
    id: 'm1', title: 'Standup', description: null, createdById: 'u1',
    scheduledAt: new Date('2026-06-20T09:00:00Z'), durationMin: 30,
    status: 'scheduled', joinToken: 'tok1', externalId: null, ...over,
  });

  it('inserts a new event with the join link + ownership marker and stores ids', async () => {
    prismaMock.meeting.findUnique
      .mockResolvedValueOnce(meeting() as any)        // main load
      .mockResolvedValueOnce({ id: 'm1', joinToken: 'tok1' } as any); // joinUrlFor
    prismaMock.googleCalendarConnection.findUnique.mockResolvedValue(conn() as any);
    mockFetch.mockResolvedValueOnce(ok({ id: 'ev-new', etag: '"e9"' }));

    await syncMeetingToGoogle('m1', 'upsert');

    const [path, init] = mockFetch.mock.calls[0].slice(1) as [string, RequestInit];
    expect(path).toBe('/calendars/cal1/events');
    const body = JSON.parse(String(init.body));
    expect(body.location).toContain('/join/tok1');
    expect(body.extendedProperties.private.garelyMeetingId).toBe('m1');
    const upd = prismaMock.meeting.update.mock.calls[0][0] as any;
    expect(upd.data.externalId).toBe('ev-new');
    expect(upd.data.externalEtag).toBe('"e9"');
  });

  it('deletes the linked event on meeting delete (404 tolerated)', async () => {
    prismaMock.meeting.findUnique.mockResolvedValueOnce(meeting({ externalId: 'ev1' }) as any);
    prismaMock.googleCalendarConnection.findUnique.mockResolvedValue(conn() as any);
    mockFetch.mockResolvedValueOnce(ok({}, 404));
    await syncMeetingToGoogle('m1', 'delete');
    const [path, init] = mockFetch.mock.calls[0].slice(1) as [string, RequestInit];
    expect(path).toBe('/calendars/cal1/events/ev1');
    expect(init.method).toBe('DELETE');
  });

  it('does nothing when the creator has no connection', async () => {
    prismaMock.meeting.findUnique.mockResolvedValueOnce(meeting() as any);
    prismaMock.googleCalendarConnection.findUnique.mockResolvedValue(null as any);
    await syncMeetingToGoogle('m1', 'upsert');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
