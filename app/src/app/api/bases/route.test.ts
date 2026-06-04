import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { jsonReq } from '@/test/helpers';
import { GET, POST } from '@/app/api/bases/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

const mockAuth = vi.mocked(auth);
const url = 'http://localhost/api/bases';
const sess = (orgId = 'org-A') => ({ user: { id: 'u1', role: 'member', orgId } }) as any;

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
});

describe('GET /api/bases', () => {
  it('401 when signed out', async () => {
    mockAuth.mockResolvedValue(null as any);
    expect((await GET(jsonReq('GET', undefined, url))).status).toBe(401);
  });

  it('lists only the session org bases (tenant scoping)', async () => {
    mockAuth.mockResolvedValue(sess('org-A'));
    prismaMock.base.findMany.mockResolvedValue([] as any);
    await GET(jsonReq('GET', undefined, url));
    const where = prismaMock.base.findMany.mock.calls[0][0]!.where as any;
    expect(where.orgId).toBe('org-A');
  });
});

describe('POST /api/bases', () => {
  it('creates a base stamped with the session org + creator', async () => {
    mockAuth.mockResolvedValue(sess('org-A'));
    prismaMock.base.count.mockResolvedValue(0 as any);
    prismaMock.base.create.mockResolvedValue({ id: 'b1', name: 'CRM' } as any);
    const res = await POST(jsonReq('POST', { name: 'CRM' }, url));
    expect(res.status).toBe(201);
    const data = prismaMock.base.create.mock.calls[0][0]!.data as any;
    expect(data.orgId).toBe('org-A');
    expect(data.name).toBe('CRM');
    expect(data.createdById).toBe('u1');
  });

  it('400 on an empty name', async () => {
    mockAuth.mockResolvedValue(sess('org-A'));
    expect((await POST(jsonReq('POST', { name: '   ' }, url))).status).toBe(400);
  });
});
