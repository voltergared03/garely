import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { userCanAccessMeeting, meetingIdOfTask, userDepartmentIds, userCanViewTask } from '@/lib/access';
import { mockSession, jsonReq } from '@/test/helpers';
import { GET, PATCH, DELETE } from '@/app/api/tasks/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/access', () => ({
  userCanAccessMeeting: vi.fn(),
  meetingIdOfTask: vi.fn(),
  userDepartmentIds: vi.fn(),
  userCanViewTask: vi.fn(),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (k: string) => k),
}));

const mockAuth = vi.mocked(auth);
const mockAccess = vi.mocked(userCanAccessMeeting);
const mockMeetingOfTask = vi.mocked(meetingIdOfTask);
const mockDeptIds = vi.mocked(userDepartmentIds);
const mockCanView = vi.mocked(userCanViewTask);

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
  mockAccess.mockReset();
  mockMeetingOfTask.mockReset();
  mockDeptIds.mockReset();
  mockDeptIds.mockResolvedValue([]);
  mockCanView.mockReset();
  // Default: standalone tasks the caller doesn't own are not viewable (→ 403),
  // matching the pre-existing authorization tests.
  mockCanView.mockResolvedValue(false);
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

  it("a non-admin scope=all is scoped (own + meetings + own department)", async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    mockDeptIds.mockResolvedValue(['d1']);
    prismaMock.meetingTask.findMany.mockResolvedValue([] as any);
    await GET(jsonReq('GET', undefined, tasksUrl('?scope=all')));
    expect(whereOf().assigneeId).toBeUndefined();
    // OR-scoped to: own tasks, meetings participated in, meetings created, own department
    expect(Array.isArray(whereOf().OR)).toBe(true);
    expect(whereOf().OR).toHaveLength(7);
    // department lens: tasks tagged to my dept, OR assigned to anyone in my dept — own departments only
    expect(whereOf().OR).toContainEqual({ departmentId: { in: ['d1'] } });
    expect(whereOf().OR).toContainEqual({ assignee: { departmentMemberships: { some: { departmentId: { in: ['d1'] } } } } });
    // collaboration lens: tasks I've been added to as a collaborator
    expect(whereOf().OR).toContainEqual({ collaborators: { some: { userId: 'u1' } } });
    expect(whereOf().OR).toContainEqual({ assignees: { some: { userId: 'u1' } } });
  });

  it('org-scopes the list to the session org (cross-tenant isolation keystone)', async () => {
    // A member of org-B must never get org-A's tasks back from the list query.
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'member', orgId: 'org-B' } } as any);
    prismaMock.meetingTask.findMany.mockResolvedValue([] as any);
    await GET(jsonReq('GET', undefined, tasksUrl('?scope=mine')));
    expect(whereOf().AND).toContainEqual({ orgId: 'org-B' });
  });

  it('an admin scope=all sees everything (no scope filter)', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'a1', role: 'admin' }));
    prismaMock.meetingTask.findMany.mockResolvedValue([] as any);
    await GET(jsonReq('GET', undefined, tasksUrl('?scope=all')));
    expect(whereOf().assigneeId).toBeUndefined();
    expect(whereOf().OR).toBeUndefined();
  });

  it('the department filter narrows results to one department', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'a1', role: 'admin' }));
    prismaMock.meetingTask.findMany.mockResolvedValue([] as any);
    await GET(jsonReq('GET', undefined, tasksUrl('?scope=all&department=sales')));
    expect(whereOf().departmentId).toBe('sales');
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
    prismaMock.meetingTask.findUnique.mockResolvedValue({ meetingId: 'm1', assigneeId: null } as any);
    mockAccess.mockResolvedValue(false);
    expect((await PATCH(jsonReq('PATCH', { taskId: 't1', status: 'done' }))).status).toBe(403);
  });

  it('updates when meeting access is granted', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ meetingId: 'm1', assigneeId: null } as any);
    mockAccess.mockResolvedValue(true);
    prismaMock.meetingTask.update.mockResolvedValue({ id: 't1' } as any);
    const r = await PATCH(jsonReq('PATCH', { taskId: 't1', status: 'done' }));
    expect(r.status).toBe(200);
    expect(prismaMock.meetingTask.update).toHaveBeenCalled();
  });

  it('403 on a standalone task when the caller is not its assignee', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ meetingId: null, assigneeId: 'someone-else' } as any);
    const r = await PATCH(jsonReq('PATCH', { taskId: 't1', status: 'done' }));
    expect(r.status).toBe(403);
    expect(prismaMock.meetingTask.update).not.toHaveBeenCalled();
  });

  it('updates a standalone task when the caller is its assignee', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ meetingId: null, assigneeId: 'u1' } as any);
    prismaMock.meetingTask.update.mockResolvedValue({ id: 't1' } as any);
    expect((await PATCH(jsonReq('PATCH', { taskId: 't1', status: 'done' }))).status).toBe(200);
  });

  it('allows a non-assignee who can view the task (e.g. department member) to update it', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ meetingId: null, assigneeId: 'someone-else' } as any);
    mockCanView.mockResolvedValue(true);
    prismaMock.meetingTask.update.mockResolvedValue({ id: 't1' } as any);
    expect((await PATCH(jsonReq('PATCH', { taskId: 't1', status: 'done' }))).status).toBe(200);
  });

  it('ignores non-whitelisted fields (no mass-assignment)', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ meetingId: 'm1', assigneeId: null } as any);
    mockAccess.mockResolvedValue(true);
    prismaMock.meetingTask.update.mockResolvedValue({ id: 't1' } as any);
    await PATCH(jsonReq('PATCH', { taskId: 't1', status: 'done', meetingId: 'evil', source: 'ai', reportId: 'r9' }));
    const data = (prismaMock.meetingTask.update.mock.calls[0][0] as any).data;
    expect(data.meetingId).toBeUndefined();
    expect(data.source).toBeUndefined();
    expect(data.reportId).toBeUndefined();
    expect(data.status).toBe('done');
  });
});

describe('DELETE /api/tasks — authorization', () => {
  it("403 when the user cannot access the task's meeting", async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ meetingId: 'm1', assigneeId: null } as any);
    mockAccess.mockResolvedValue(false);
    expect((await DELETE(jsonReq('DELETE', { taskId: 't1' }))).status).toBe(403);
  });

  it('403 deleting a standalone task the caller does not own', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ meetingId: null, assigneeId: 'someone-else' } as any);
    const r = await DELETE(jsonReq('DELETE', { taskId: 't1' }));
    expect(r.status).toBe(403);
    expect(prismaMock.meetingTask.delete).not.toHaveBeenCalled();
  });

  it('deletes a standalone task owned by the caller (assignee)', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ meetingId: null, assigneeId: 'u1' } as any);
    prismaMock.meetingTask.delete.mockResolvedValue({ id: 't1' } as any);
    const r = await DELETE(jsonReq('DELETE', { taskId: 't1' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('lets an admin delete any standalone task', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'a1', role: 'admin' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ meetingId: null, assigneeId: 'someone-else' } as any);
    prismaMock.meetingTask.delete.mockResolvedValue({ id: 't1' } as any);
    expect((await DELETE(jsonReq('DELETE', { taskId: 't1' }))).status).toBe(200);
  });
});
