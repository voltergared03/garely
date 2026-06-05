import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { rowForOrg, basePermission } from '@/lib/base-engine';
import { jsonReq, ctx } from '@/test/helpers';
import { GET, POST } from '@/app/api/rows/[id]/attachments/route';
import { GET as DOWNLOAD, DELETE } from '@/app/api/rows/[id]/attachments/[attachmentId]/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/base-engine', () => {
  const RANK: Record<string, number> = { none: 0, viewer: 1, editor: 2, admin: 3 };
  return {
    rowForOrg: vi.fn(),
    basePermission: vi.fn(),
    atLeast: (level: string, min: string) => RANK[level] >= RANK[min],
  };
});
vi.mock('@/lib/task-files', () => ({
  saveRowFile: vi.fn(async () => ({ filePath: 'r1/stored.pdf', fileSize: 2048 })),
  resolveRowFile: vi.fn(() => null),
  deleteRowFile: vi.fn(),
  downloadContentType: vi.fn(() => 'application/octet-stream'),
  MAX_FILE_SIZE: 25 * 1024 * 1024,
}));

const mockAuth = vi.mocked(auth);
const mockRowForOrg = vi.mocked(rowForOrg);
const mockBasePerm = vi.mocked(basePermission);

const sess = (id = 'u1', role = 'member', orgId = 'org-A') => ({ user: { id, role, orgId } }) as any;
const ROW = { id: 'r1', table: { id: 't1', base: { id: 'b1', orgId: 'org-A', visibility: 'org', createdById: null } } };
const listUrl = 'http://localhost/api/rows/r1/attachments';
const fileUrl = 'http://localhost/api/rows/r1/attachments/a1';

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
  mockRowForOrg.mockReset();
  mockBasePerm.mockReset();
  mockAuth.mockResolvedValue(sess());
  mockRowForOrg.mockResolvedValue(ROW as any);
  mockBasePerm.mockResolvedValue({ level: 'editor', hiddenFields: [] } as any);
});

describe('GET /api/rows/[id]/attachments', () => {
  it('404 when the row is not accessible', async () => {
    mockRowForOrg.mockResolvedValue(null as any);
    expect((await GET(jsonReq('GET', undefined, listUrl), ctx({ id: 'r1' }))).status).toBe(404);
  });

  it('lists attachments, coerces BigInt size, resolves uploader name', async () => {
    prismaMock.rowAttachment.findMany.mockResolvedValue([
      { id: 'a1', fileName: 'x.pdf', filePath: 'r1/x', mimeType: 'application/pdf', fileSize: 2048n, uploadedById: 'u9', createdAt: new Date() },
    ] as any);
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u9', name: 'Nadia' }] as any);
    const r = await GET(jsonReq('GET', undefined, listUrl), ctx({ id: 'r1' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body[0].fileSize).toBe(2048);
    expect(typeof body[0].fileSize).toBe('number');
    expect(body[0].uploadedBy).toEqual({ id: 'u9', name: 'Nadia' });
  });
});

describe('POST /api/rows/[id]/attachments', () => {
  it('404 when the row is not accessible', async () => {
    mockRowForOrg.mockResolvedValue(null as any);
    expect((await POST(jsonReq('POST', {}, listUrl), ctx({ id: 'r1' }))).status).toBe(404);
  });

  it('403 for a viewer (below editor)', async () => {
    mockBasePerm.mockResolvedValue({ level: 'viewer', hiddenFields: [] } as any);
    expect((await POST(jsonReq('POST', {}, listUrl), ctx({ id: 'r1' }))).status).toBe(403);
  });

  it('400 when no file is supplied', async () => {
    expect((await POST(jsonReq('POST', {}, listUrl), ctx({ id: 'r1' }))).status).toBe(400);
  });
});

describe('GET (download) /api/rows/[id]/attachments/[attachmentId]', () => {
  it('404 when the row is not accessible', async () => {
    mockRowForOrg.mockResolvedValue(null as any);
    expect((await DOWNLOAD(jsonReq('GET', undefined, fileUrl), ctx({ id: 'r1', attachmentId: 'a1' }))).status).toBe(404);
  });

  it('404 when the attachment belongs to a different row', async () => {
    prismaMock.rowAttachment.findUnique.mockResolvedValue({ id: 'a1', rowId: 'other', filePath: 'x', fileName: 'f' } as any);
    expect((await DOWNLOAD(jsonReq('GET', undefined, fileUrl), ctx({ id: 'r1', attachmentId: 'a1' }))).status).toBe(404);
  });
});

describe('DELETE /api/rows/[id]/attachments/[attachmentId]', () => {
  it('403 when the caller is neither uploader nor base-admin', async () => {
    prismaMock.rowAttachment.findUnique.mockResolvedValue({ rowId: 'r1', uploadedById: 'someone', filePath: 'p' } as any);
    const r = await DELETE(jsonReq('DELETE', undefined, fileUrl), ctx({ id: 'r1', attachmentId: 'a1' }));
    expect(r.status).toBe(403);
    expect(prismaMock.rowAttachment.delete).not.toHaveBeenCalled();
  });

  it('lets the uploader delete their attachment', async () => {
    prismaMock.rowAttachment.findUnique.mockResolvedValue({ rowId: 'r1', uploadedById: 'u1', filePath: 'p' } as any);
    prismaMock.rowAttachment.delete.mockResolvedValue({ id: 'a1' } as any);
    expect((await DELETE(jsonReq('DELETE', undefined, fileUrl), ctx({ id: 'r1', attachmentId: 'a1' }))).status).toBe(200);
  });

  it('lets a base-admin delete any attachment', async () => {
    mockBasePerm.mockResolvedValue({ level: 'admin', hiddenFields: [] } as any);
    prismaMock.rowAttachment.findUnique.mockResolvedValue({ rowId: 'r1', uploadedById: 'someone', filePath: 'p' } as any);
    prismaMock.rowAttachment.delete.mockResolvedValue({ id: 'a1' } as any);
    expect((await DELETE(jsonReq('DELETE', undefined, fileUrl), ctx({ id: 'r1', attachmentId: 'a1' }))).status).toBe(200);
  });
});
