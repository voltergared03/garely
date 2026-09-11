import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => ({ user: { id: 'u1', role: 'admin' } })) }));
vi.mock('@/lib/meeting-invite', () => ({ sendMeetingInvite: vi.fn(async () => {}) }));
vi.mock('@/lib/calendar-sync', () => ({ syncMeetingToGoogle: vi.fn(async () => {}) }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (k: string) => k) }));
vi.mock('@/lib/livekit', () => ({ roomService: { deleteRoom: vi.fn(async () => {}) } }));
vi.mock('@/lib/meeting-reschedule', () => ({ notifyMeetingRescheduled: vi.fn(async () => 1) }));
vi.mock('@/lib/meeting-attempt-facts', () => ({
  classifyMeetingAttempt: vi.fn(async () => ({ verdict: 'held', reason: 'speech' })),
  discardAttemptRecordings: vi.fn(async () => 0),
}));

beforeEach(() => { mockReset(prismaMock); });

describe('DELETE /api/meetings/[id] — task cleanup', () => {
  it('sweeps the meeting task Rows and their ClickUp links (no FK does it for us)', async () => {
    // Regression: TaskRow.meetingId has no foreign key, so deleting a meeting left its
    // AI tasks behind forever — pointing at a meeting that no longer exists and
    // un-editable for non-admins because permission resolves through that dead meeting.
    const { DELETE } = await import('./route');
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', createdById: 'u1', orgId: 'o1' } as any);
    prismaMock.recording.count.mockResolvedValue(0 as any);
    prismaMock.taskRow.findMany.mockResolvedValue([{ rowId: 'r1' }, { rowId: 'r2' }] as any);
    prismaMock.clickUpTaskLink.deleteMany.mockResolvedValue({ count: 2 } as any);
    prismaMock.row.deleteMany.mockResolvedValue({ count: 2 } as any);
    prismaMock.meeting.delete.mockResolvedValue({} as any);

    await DELETE(new Request('http://x', { method: 'DELETE' }) as any, { params: Promise.resolve({ id: 'm1' }) } as any);

    expect(prismaMock.clickUpTaskLink.deleteMany).toHaveBeenCalledWith({ where: { rowId: { in: ['r1', 'r2'] } } });
    expect(prismaMock.row.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['r1', 'r2'] } } });
    expect(prismaMock.meeting.delete).toHaveBeenCalled();
  });
});

describe('PATCH /api/meetings/[id] — rescheduling a meeting that is live', () => {
  const patch = async (body: any) => {
    const { PATCH } = await import('./route');
    return PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) as any,
      { params: Promise.resolve({ id: 'm1' }) } as any);
  };
  const live = {
    id: 'm1', createdById: 'u1', status: 'live', livekitRoom: 'meet-m1',
    scheduledAt: new Date('2026-09-07T13:00:00Z'), startedAt: new Date('2026-09-07T12:55:00Z'),
    durationMin: 30, title: 'T', participants: [],
  };

  it('refuses (409) when the meeting is really in progress', async () => {
    const { classifyMeetingAttempt } = await import('@/lib/meeting-attempt-facts');
    (classifyMeetingAttempt as any).mockResolvedValueOnce({ verdict: 'held', reason: 'speech' });
    prismaMock.meeting.findUnique.mockResolvedValue(live as any);

    const res = await patch({ scheduledAt: '2026-09-07T15:00:00Z' });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'meetingLiveCannotReschedule', liveConflict: true });
    expect(prismaMock.meeting.update).not.toHaveBeenCalled();
  });

  it('resets a false start: back to scheduled, room closed, stamps cleared', async () => {
    const { classifyMeetingAttempt, discardAttemptRecordings } = await import('@/lib/meeting-attempt-facts');
    const { roomService } = await import('@/lib/livekit');
    (classifyMeetingAttempt as any).mockResolvedValueOnce({ verdict: 'abandoned', reason: 'short-and-empty' });
    prismaMock.meeting.findUnique
      .mockResolvedValueOnce(live as any)
      .mockResolvedValueOnce({ ...live, status: 'scheduled', scheduledAt: new Date('2026-09-07T15:00:00Z') } as any);
    prismaMock.meeting.update.mockResolvedValue({} as any);
    prismaMock.meetingParticipant.updateMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.transcriptSegment.deleteMany.mockResolvedValue({ count: 0 } as any);

    const res = await patch({ scheduledAt: '2026-09-07T15:00:00Z' });

    expect(res.status).toBe(200);
    expect(prismaMock.meeting.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'scheduled', startedAt: null, endedAt: null, scheduledAt: new Date('2026-09-07T15:00:00Z') }),
    }));
    expect(prismaMock.meetingParticipant.updateMany).toHaveBeenCalledWith({ where: { meetingId: 'm1' }, data: { joinedAt: null, leftAt: null } });
    expect(discardAttemptRecordings).toHaveBeenCalledWith('m1', live.startedAt);
    expect(prismaMock.transcriptSegment.deleteMany).toHaveBeenCalledWith({ where: { meetingId: 'm1', startEpochMs: { gte: live.startedAt.getTime() } } });
    expect(roomService.deleteRoom).toHaveBeenCalledWith('meet-m1');
  });

  it('leaves a live meeting alone when only the title changes', async () => {
    const { classifyMeetingAttempt } = await import('@/lib/meeting-attempt-facts');
    const { roomService } = await import('@/lib/livekit');
    (classifyMeetingAttempt as any).mockClear();
    (roomService.deleteRoom as any).mockClear();
    prismaMock.meeting.findUnique.mockResolvedValueOnce(live as any).mockResolvedValueOnce({ ...live, title: 'New' } as any);
    prismaMock.meeting.update.mockResolvedValue({} as any);

    const res = await patch({ title: 'New' });

    expect(res.status).toBe(200);
    expect(classifyMeetingAttempt).not.toHaveBeenCalled();
    expect(roomService.deleteRoom).not.toHaveBeenCalled();
    expect(prismaMock.meeting.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ status: expect.anything() }) }));
  });
});

describe('PATCH /api/meetings/[id] — moving a scheduled meeting rings the bell', () => {
  const patch = async (body: any) => {
    const { PATCH } = await import('./route');
    return PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) as any,
      { params: Promise.resolve({ id: 'm1' }) } as any);
  };
  const scheduled = { id: 'm1', createdById: 'u1', status: 'scheduled', livekitRoom: null, scheduledAt: new Date('2026-09-11T10:00:00Z'), startedAt: null, durationMin: 60, title: 'T', participants: [] };

  it('notifies participants (except the editor) when the time changes', async () => {
    const { notifyMeetingRescheduled } = await import('@/lib/meeting-reschedule');
    (notifyMeetingRescheduled as any).mockClear();
    prismaMock.meeting.findUnique
      .mockResolvedValueOnce(scheduled as any)
      .mockResolvedValueOnce({ ...scheduled, scheduledAt: new Date('2026-09-15T09:00:00Z') } as any);
    prismaMock.meeting.update.mockResolvedValue({} as any);
    const res = await patch({ scheduledAt: '2026-09-15T09:00:00Z' });
    expect(res.status).toBe(200);
    expect(notifyMeetingRescheduled).toHaveBeenCalledWith('m1', { exceptUserId: 'u1' });
  });

  it('stays quiet when only the title changes', async () => {
    const { notifyMeetingRescheduled } = await import('@/lib/meeting-reschedule');
    (notifyMeetingRescheduled as any).mockClear();
    prismaMock.meeting.findUnique
      .mockResolvedValueOnce(scheduled as any)
      .mockResolvedValueOnce({ ...scheduled, title: 'New' } as any);
    prismaMock.meeting.update.mockResolvedValue({} as any);
    await patch({ title: 'New' });
    expect(notifyMeetingRescheduled).not.toHaveBeenCalled();
  });
});
