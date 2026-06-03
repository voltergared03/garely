import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { userCanViewTask } from '@/lib/access';
import { notify } from '@/lib/notify';
import { mockSession, jsonReq, ctx } from '@/test/helpers';
import { GET, POST, DELETE } from '@/app/api/tasks/[id]/comments/route';

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

const url = (qs = '') => `http://localhost/api/tasks/t1/comments${qs}`;

describe('GET /api/tasks/[id]/comments', () => {
  it('401 when signed out', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(jsonReq('GET', undefined, url()), ctx({ id: 't1' }))).status).toBe(401);
  });

  it('403 when the user cannot view the task', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockView.mockResolvedValue(false);
    expect((await GET(jsonReq('GET', undefined, url()), ctx({ id: 't1' }))).status).toBe(403);
  });

  it('lists comments for the task when allowed', async () => {
    mockAuth.mockResolvedValue(mockSession());
    prismaMock.taskComment.findMany.mockResolvedValue([{ id: 'c1' }] as any);
    const r = await GET(jsonReq('GET', undefined, url()), ctx({ id: 't1' }));
    expect(r.status).toBe(200);
    expect(prismaMock.taskComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taskId: 't1' } }),
    );
  });
});

describe('POST /api/tasks/[id]/comments', () => {
  it('403 when the user cannot view the task', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockView.mockResolvedValue(false);
    expect((await POST(jsonReq('POST', { body: 'hi' }, url()), ctx({ id: 't1' }))).status).toBe(403);
  });

  it('400 on an empty body', async () => {
    mockAuth.mockResolvedValue(mockSession());
    expect((await POST(jsonReq('POST', { body: '' }, url()), ctx({ id: 't1' }))).status).toBe(400);
  });

  it('creates a comment, gates @mentions to the audience, and notifies', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'author', name: 'Author' }));
    prismaMock.meetingTask.findUnique.mockResolvedValue({
      title: 'T',
      assigneeId: 'assignee',
      departmentId: null,
      collaborators: [{ userId: 'collab' }],
    } as any);
    prismaMock.taskComment.create.mockResolvedValue({ id: 'c1' } as any);

    const r = await POST(
      jsonReq('POST', { body: 'hello @collab', mentions: ['collab', 'outsider'] }, url()),
      ctx({ id: 't1' }),
    );
    expect(r.status).toBe(201);
    expect(prismaMock.taskComment.create).toHaveBeenCalled();

    // @mention reaches only audience members ('collab'); 'outsider' is filtered out.
    const mentionCall = mockNotify.mock.calls.find((c) => (c[0] as any).type === 'mention');
    expect((mentionCall?.[0] as any).userIds).toEqual(['collab']);
    // Remaining audience (assignee), minus author and mentioned, gets a comment ping.
    const commentCall = mockNotify.mock.calls.find((c) => (c[0] as any).type === 'task_comment');
    expect((commentCall?.[0] as any).userIds).toEqual(['assignee']);
  });
});

describe('DELETE /api/tasks/[id]/comments', () => {
  it('400 when commentId is missing', async () => {
    mockAuth.mockResolvedValue(mockSession());
    expect((await DELETE(jsonReq('DELETE', undefined, url()), ctx({ id: 't1' }))).status).toBe(400);
  });

  it('403 when the caller is neither the author nor an admin', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.taskComment.findUnique.mockResolvedValue({ taskId: 't1', userId: 'someone' } as any);
    const r = await DELETE(jsonReq('DELETE', undefined, url('?commentId=c1')), ctx({ id: 't1' }));
    expect(r.status).toBe(403);
    expect(prismaMock.taskComment.delete).not.toHaveBeenCalled();
  });

  it('lets the author delete their own comment', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.taskComment.findUnique.mockResolvedValue({ taskId: 't1', userId: 'u1' } as any);
    prismaMock.taskComment.delete.mockResolvedValue({ id: 'c1' } as any);
    expect((await DELETE(jsonReq('DELETE', undefined, url('?commentId=c1')), ctx({ id: 't1' }))).status).toBe(200);
  });

  it('404 when the comment belongs to a different task', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'admin' }));
    prismaMock.taskComment.findUnique.mockResolvedValue({ taskId: 'other', userId: 'u1' } as any);
    expect((await DELETE(jsonReq('DELETE', undefined, url('?commentId=c1')), ctx({ id: 't1' }))).status).toBe(404);
  });
});
