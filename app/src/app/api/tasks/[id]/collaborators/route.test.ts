import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { userCanViewTask } from '@/lib/access';
import { notify } from '@/lib/notify';
import { mockSession, jsonReq, ctx } from '@/test/helpers';
import { GET, POST, DELETE } from '@/app/api/tasks/[id]/collaborators/route';

// Tasks are base-engine Rows: collaborators are RowCollaborator, keyed by rowId.
vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/access', () => ({ userCanViewTask: vi.fn(), userCanAccessMeeting: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }));
vi.mock('@/lib/system-tasks-table', () => ({
  getSystemTasksTable: vi.fn(async () => ({ fieldIds: { title: 'fTitle', description: 'fDesc', status: 'fStatus', priority: 'fPrio', dueDate: 'fDue', assignee: 'fAss' } })),
}));
vi.mock('@/lib/tasks', () => ({ usersByIds: vi.fn(async () => new Map()) }));

const mockAuth = vi.mocked(auth);
const mockView = vi.mocked(userCanViewTask);
const mockNotify = vi.mocked(notify);

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
  mockView.mockReset();
  mockNotify.mockReset();
  mockView.mockResolvedValue(true);
});

const url = (qs = '') => `http://localhost/api/tasks/t1/collaborators${qs}`;
const ROW = { data: { fTitle: 'T' }, table: { base: { orgId: 'org-A' } } };

describe('GET /api/tasks/[id]/collaborators', () => {
  it('403 when the user cannot view the task', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockView.mockResolvedValue(false);
    expect((await GET(jsonReq('GET', undefined, url()), ctx({ id: 't1' }))).status).toBe(403);
  });

  it('lists collaborators when allowed', async () => {
    mockAuth.mockResolvedValue(mockSession());
    prismaMock.rowCollaborator.findMany.mockResolvedValue([] as any);
    const r = await GET(jsonReq('GET', undefined, url()), ctx({ id: 't1' }));
    expect(r.status).toBe(200);
    expect(prismaMock.rowCollaborator.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { rowId: 't1' } }));
  });
});

describe('POST /api/tasks/[id]/collaborators', () => {
  it('400 when userId is missing', async () => {
    mockAuth.mockResolvedValue(mockSession());
    expect((await POST(jsonReq('POST', {}, url()), ctx({ id: 't1' }))).status).toBe(400);
  });

  it('404 when the user does not exist', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1' }));
    prismaMock.row.findUnique.mockResolvedValue(ROW as any);
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    expect((await POST(jsonReq('POST', { userId: 'ghost' }, url()), ctx({ id: 't1' }))).status).toBe(404);
  });

  it('adds a collaborator and notifies them', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', name: 'Owner' }));
    prismaMock.row.findUnique.mockResolvedValue(ROW as any);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' } as any);
    prismaMock.rowCollaborator.upsert.mockResolvedValue({ id: 'tc1', userId: 'u2', createdAt: new Date() } as any);

    const r = await POST(jsonReq('POST', { userId: 'u2' }, url()), ctx({ id: 't1' }));
    expect(r.status).toBe(201);
    expect(prismaMock.rowCollaborator.upsert).toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ type: 'task_collaborator', userIds: ['u2'] }));
  });

  it('does not notify when a user adds themselves', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1' }));
    prismaMock.row.findUnique.mockResolvedValue(ROW as any);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
    prismaMock.rowCollaborator.upsert.mockResolvedValue({ id: 'tc1', userId: 'u1', createdAt: new Date() } as any);
    await POST(jsonReq('POST', { userId: 'u1' }, url()), ctx({ id: 't1' }));
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/tasks/[id]/collaborators', () => {
  it('400 when userId is missing', async () => {
    mockAuth.mockResolvedValue(mockSession());
    expect((await DELETE(jsonReq('DELETE', undefined, url()), ctx({ id: 't1' }))).status).toBe(400);
  });

  it('removes the collaborator', async () => {
    mockAuth.mockResolvedValue(mockSession());
    prismaMock.rowCollaborator.deleteMany.mockResolvedValue({ count: 1 } as any);
    const r = await DELETE(jsonReq('DELETE', undefined, url('?userId=u2')), ctx({ id: 't1' }));
    expect(r.status).toBe(200);
    expect(prismaMock.rowCollaborator.deleteMany).toHaveBeenCalledWith({ where: { rowId: 't1', userId: 'u2' } });
  });
});
