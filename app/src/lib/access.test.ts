import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { userCanAccessMeeting, meetingIdOfTask } from '@/lib/access';

// Route/lib code imports `@/lib/prisma`; redirect it to the deep mock.
vi.mock('@/lib/prisma');

beforeEach(() => mockReset(prismaMock));

describe('userCanAccessMeeting', () => {
  it('allows admins without hitting the DB', async () => {
    expect(await userCanAccessMeeting('m1', 'u1', 'admin')).toBe(true);
    expect(prismaMock.meeting.findUnique).not.toHaveBeenCalled();
  });

  it('returns false when meetingId or userId is missing', async () => {
    expect(await userCanAccessMeeting('', 'u1')).toBe(false);
    expect(await userCanAccessMeeting('m1', null)).toBe(false);
    expect(await userCanAccessMeeting('m1', undefined)).toBe(false);
  });

  it('allows the meeting creator', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({
      createdById: 'u1',
      participants: [],
    } as any);
    expect(await userCanAccessMeeting('m1', 'u1')).toBe(true);
  });

  it('allows a participant', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({
      createdById: 'someone-else',
      participants: [{ id: 'p1' }],
    } as any);
    expect(await userCanAccessMeeting('m1', 'u1')).toBe(true);
  });

  it('denies a non-member', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({
      createdById: 'someone-else',
      participants: [],
    } as any);
    expect(await userCanAccessMeeting('m1', 'u1')).toBe(false);
  });

  it('denies when the meeting does not exist', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue(null as any);
    expect(await userCanAccessMeeting('m1', 'u1')).toBe(false);
  });
});

describe('meetingIdOfTask', () => {
  it('returns null for an empty taskId', async () => {
    expect(await meetingIdOfTask('')).toBe(null);
  });

  it('resolves the meeting id of a task', async () => {
    prismaMock.taskRow.findUnique.mockResolvedValue({ meetingId: 'm9' } as any);
    expect(await meetingIdOfTask('t1')).toBe('m9');
  });

  it('returns null when the task is missing', async () => {
    prismaMock.taskRow.findUnique.mockResolvedValue(null as any);
    expect(await meetingIdOfTask('t1')).toBe(null);
  });
});
