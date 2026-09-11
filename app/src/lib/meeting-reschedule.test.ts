import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { notify } from '@/lib/notify';

vi.mock('@/lib/prisma');
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async (i: any) => i.userIds.length) }));
vi.mock('@/lib/i18n-server', () => ({ workspaceLocale: vi.fn(async () => 'uk'), workspaceTimezone: vi.fn(async () => 'Europe/Kyiv') }));

beforeEach(() => { mockReset(prismaMock); vi.mocked(notify).mockClear(); });

describe('notifyMeetingRescheduled', () => {
  it('tells every active participant except the person who moved it, with the new wall-clock time', async () => {
    const { notifyMeetingRescheduled } = await import('./meeting-reschedule');
    prismaMock.meeting.findUnique.mockResolvedValue({
      id: 'm1', title: 'Monthly', scheduledAt: new Date('2026-09-15T09:00:00Z'),
      participants: [
        { userId: 'host', user: { status: 'active' } },
        { userId: 'u2', user: { status: 'active' } },
        { userId: 'u3', user: { status: 'disabled' } },
        { userId: null, user: null }, // a guest: no bell to ring
      ],
    } as any);
    const n = await notifyMeetingRescheduled('m1', { exceptUserId: 'host' });
    expect(n).toBe(1);
    const call = vi.mocked(notify).mock.calls[0][0];
    expect(call.userIds).toEqual(['u2']);
    expect(call.type).toBe('meeting_rescheduled');
    expect(call.values?.time).toMatch(/12:00/); // 09:00Z is 12:00 in Kyiv
    expect(call.link).toBe('/lobby/m1');
  });

  it('is a no-op for a meeting without a time', async () => {
    const { notifyMeetingRescheduled } = await import('./meeting-reschedule');
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', title: 'x', scheduledAt: null, participants: [{ userId: 'u2', user: { status: 'active' } }] } as any);
    expect(await notifyMeetingRescheduled('m1')).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
});
