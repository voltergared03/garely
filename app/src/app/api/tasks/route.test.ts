import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { userCanAccessMeeting, meetingIdOfTask } from '@/lib/access';
import { mockSession, jsonReq } from '@/test/helpers';
import { GET, PATCH, DELETE } from '@/app/api/tasks/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/access', () => ({
  userCanAccessMeeting: vi.fn(),
  meetingIdOfTask: vi.fn(),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (k: string) => k),
}));

const mockAuth = vi.mocked(auth);
const mockAccess = vi.mocked(userCanAccessMeeting);
const mockMeetingOfTask = vi.mocked(meetingIdOfTask);

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
  mockAccess.mockReset();
  mockMeetingOfTask.mockReset();
});

const tasksUrl = (qs = '') => `http://localhost/api/tasks${qs}`;
const whereOf = () => prismaMock.meetingTask.findMany.mock.calls[0][0]!.where as any;

describe('GET /api/tasks — scope filter', () => {
  it('401 when not signed in', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(jsonReq('GET', undefined, tasksUrl()))).status).toBe(401);
  });

  it("scope=mine filters to the user's own assigned tasks", async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.meetingTask.findMany.mockResolvedValue([] as any);
    await GET(jsonReq('GET', undefined, tasksUrl('?scope=mine')));
    expect(whereOf().assigneeId).toBe('u1');
    expect(whereOf().OR).toBeUndefined();
  });

  it("a non-admin scope=all is scoped (cannot leak other users' tasks)", async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.meetingTask.findMany.mockResolvedValue([] as any);
    await GET(jsonReq('GET', undefined, tasksUrl('?scope=all')));
    expect(whereOf().assigneeId).toBeUndefined();
    // OR-scoped to: own tasks, meetings participated in, meetings created
    expect(Array.isArray(whereOf().OR)).toBe(true);
    expect(whereOf().OR).toHaveLength(3);
  });

  it('an admin scope=all sees everything (no scope filter)', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'a1', role: 'admin' }));
    prismaMock.meetingTask.findMany.mockResolvedValue([] as any);
    await GET(jsonReq('GET', undefined, tasksUrl('?scope=all')));
    expect(whereOf().assigneeId).toBeUndefined();
    expect(whereOf().OR).toBeUndefined();
  });
});

describe('PATCH /api/tasks — authorization', () => {
  it('401 when not signed in', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await PATCH(jsonReq('PATCH', { taskId: 't1' }))).status).toBe(401);
  });

  it('400 when taskId is missing', async () => {
    mockAuth.mockResolvedValue(mockSession());
    expect((await PATCH(jsonReq('PATCH', {}))).status).toBe(400);
  });

  it("403 when the user cannot access the task's meeting", async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    mockMeetingOfTask.mockResolvedValue('m1');
    mockAccess.mockResolvedValue(false);
    expect((await PATCH(jsonReq('PATCH', { taskId: 't1', status: 'done' }))).status).toBe(403);
  });

  it('updates when meeting access is granted', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    mockMeetingOfTask.mockResolvedValue('m1');
    mockAccess.mockResolvedValue(true);
    prismaMock.meetingTask.update.mockResolvedValue({ id: 't1' } as any);
    const r = await PATCH(jsonReq('PATCH', { taskId: 't1', status: 'done' }));
    expect(r.status).toBe(200);
    expect(prismaMock.meetingTask.update).toHaveBeenCalled();
  });
});

describe('DELETE /api/tasks — authorization', () => {
  it("403 when the user cannot access the task's meeting", async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    mockMeetingOfTask.mockResolvedValue('m1');
    mockAccess.mockResolvedValue(false);
    expect((await DELETE(jsonReq('DELETE', { taskId: 't1' }))).status).toBe(403);
  });

  it('deletes a standalone task (no meeting) for a signed-in user', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    mockMeetingOfTask.mockResolvedValue(null);
    prismaMock.meetingTask.delete.mockResolvedValue({ id: 't1' } as any);
    const r = await DELETE(jsonReq('DELETE', { taskId: 't1' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
});
