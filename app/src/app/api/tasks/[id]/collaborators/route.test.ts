import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { userCanViewTask } from '@/lib/access';
import { notify } from '@/lib/notify';
import { mockSession, jsonReq, ctx } from '@/test/helpers';
import { GET, POST, DELETE } from '@/app/api/tasks/[id]/collaborators/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/access', () => ({ userCanViewTask: vi.fn(), userCanAccessMeeting: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }));

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

describe('GET /api/tasks/[id]/collaborators', () => {
  it('403 when the user cannot view the task', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockView.mockResolvedValue(false);
    expect((await GET(jsonReq('GET', undefined, url()), ctx({ id: 't1' }))).status).toBe(403);
  });

  it('lists collaborators when allowed', async () => {
    mockAuth.mockResolvedValue(mockSession());
    prismaMock.taskCollaborator.findMany.mockResolvedValue([] as any);
    const r = await GET(jsonReq('GET', undefined, url()), ctx({ id: 't1' }));
    expect(r.status).toBe(200);
    expect(prismaMock.taskCollaborator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taskId: 't1' } }),
    );
  });
});

describe('POST /api/tasks/[id]/collaborators', () => {
  it('400 when userId is missing', async () => {
    mockAuth.mockResolvedValue(mockSession());
    expect((await POST(jsonReq('POST', {}, url()), ctx({ id: 't1' }))).status).toBe(400);
  });

  it('404 when the user does not exist', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ title: 'T' } as any);
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    expect((await POST(jsonReq('POST', { userId: 'ghost' }, url()), ctx({ id: 't1' }))).status).toBe(404);
  });

  it('adds a collaborator and notifies them', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', name: 'Owner' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ title: 'T' } as any);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u2' } as any);
    prismaMock.taskCollaborator.upsert.mockResolvedValue({ id: 'tc1', userId: 'u2' } as any);

    const r = await POST(jsonReq('POST', { userId: 'u2' }, url()), ctx({ id: 't1' }));
    expect(r.status).toBe(201);
    expect(prismaMock.taskCollaborator.upsert).toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task_collaborator', userIds: ['u2'] }),
    );
  });

  it('does not notify when a user adds themselves', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({ title: 'T' } as any);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
    prismaMock.taskCollaborator.upsert.mockResolvedValue({ id: 'tc1', userId: 'u1' } as any);
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
    prismaMock.taskCollaborator.deleteMany.mockResolvedValue({ count: 1 } as any);
    const r = await DELETE(jsonReq('DELETE', undefined, url('?userId=u2')), ctx({ id: 't1' }));
    expect(r.status).toBe(200);
    expect(prismaMock.taskCollaborator.deleteMany).toHaveBeenCalledWith({ where: { taskId: 't1', userId: 'u2' } });
  });
});
