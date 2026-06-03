import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { userCanViewTask } from '@/lib/access';
import { mockSession, jsonReq, ctx } from '@/test/helpers';
import { GET, POST } from '@/app/api/tasks/[id]/attachments/route';
import { GET as DOWNLOAD, DELETE } from '@/app/api/tasks/[id]/attachments/[attachmentId]/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/access', () => ({ userCanViewTask: vi.fn(), userCanAccessMeeting: vi.fn() }));
vi.mock('@/lib/task-files', () => ({
  saveTaskFile: vi.fn(),
  resolveTaskFile: vi.fn(() => null),
  deleteTaskFile: vi.fn(),
  downloadContentType: vi.fn(() => 'application/octet-stream'),
  MAX_FILE_SIZE: 25 * 1024 * 1024,
}));

const mockAuth = vi.mocked(auth);
const mockView = vi.mocked(userCanViewTask);

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
  mockView.mockReset();
  mockView.mockResolvedValue(true);
});

const listUrl = 'http://localhost/api/tasks/t1/attachments';
const fileUrl = 'http://localhost/api/tasks/t1/attachments/a1';

describe('GET /api/tasks/[id]/attachments', () => {
  it('403 when the user cannot view the task', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockView.mockResolvedValue(false);
    expect((await GET(jsonReq('GET', undefined, listUrl), ctx({ id: 't1' }))).status).toBe(403);
  });

  it('lists attachments and coerces BigInt fileSize to a number', async () => {
    mockAuth.mockResolvedValue(mockSession());
    prismaMock.taskAttachment.findMany.mockResolvedValue([
      { id: 'a1', fileName: 'x.pdf', fileSize: 2048n },
    ] as any);
    const r = await GET(jsonReq('GET', undefined, listUrl), ctx({ id: 't1' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body[0].fileSize).toBe(2048);
    expect(typeof body[0].fileSize).toBe('number');
  });
});

describe('POST /api/tasks/[id]/attachments', () => {
  it('403 when the user cannot view the task', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockView.mockResolvedValue(false);
    expect((await POST(jsonReq('POST', {}, listUrl), ctx({ id: 't1' }))).status).toBe(403);
  });
});

describe('GET (download) /api/tasks/[id]/attachments/[attachmentId]', () => {
  it('403 when the user cannot view the task', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockView.mockResolvedValue(false);
    expect((await DOWNLOAD(jsonReq('GET', undefined, fileUrl), ctx({ id: 't1', attachmentId: 'a1' }))).status).toBe(403);
  });

  it('404 when the attachment belongs to a different task', async () => {
    mockAuth.mockResolvedValue(mockSession());
    prismaMock.taskAttachment.findUnique.mockResolvedValue({ id: 'a1', taskId: 'other', filePath: 'x' } as any);
    expect((await DOWNLOAD(jsonReq('GET', undefined, fileUrl), ctx({ id: 't1', attachmentId: 'a1' }))).status).toBe(404);
  });
});

describe('DELETE /api/tasks/[id]/attachments/[attachmentId]', () => {
  it('403 when the caller is neither the uploader nor an admin', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.taskAttachment.findUnique.mockResolvedValue({ taskId: 't1', uploadedById: 'someone', filePath: 'p' } as any);
    const r = await DELETE(jsonReq('DELETE', undefined, fileUrl), ctx({ id: 't1', attachmentId: 'a1' }));
    expect(r.status).toBe(403);
    expect(prismaMock.taskAttachment.delete).not.toHaveBeenCalled();
  });

  it('lets the uploader delete their attachment', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1', role: 'member' }));
    prismaMock.taskAttachment.findUnique.mockResolvedValue({ taskId: 't1', uploadedById: 'u1', filePath: 'p' } as any);
    prismaMock.taskAttachment.delete.mockResolvedValue({ id: 'a1' } as any);
    expect((await DELETE(jsonReq('DELETE', undefined, fileUrl), ctx({ id: 't1', attachmentId: 'a1' }))).status).toBe(200);
  });

  it('lets an admin delete any attachment', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'a1', role: 'admin' }));
    prismaMock.taskAttachment.findUnique.mockResolvedValue({ taskId: 't1', uploadedById: 'someone', filePath: 'p' } as any);
    prismaMock.taskAttachment.delete.mockResolvedValue({ id: 'a1' } as any);
    expect((await DELETE(jsonReq('DELETE', undefined, fileUrl), ctx({ id: 't1', attachmentId: 'a1' }))).status).toBe(200);
  });
});
