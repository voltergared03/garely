import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { jsonReq } from '@/test/helpers';
import { GET, POST } from '@/app/api/servers/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

const mockAuth = vi.mocked(auth);
const url = 'http://localhost/api/servers';
const sess = (role = 'member', orgId = 'org-A') => ({ user: { id: 'u1', role, orgId } }) as any;

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
});

describe('GET /api/servers', () => {
  it('401 when signed out', async () => {
    mockAuth.mockResolvedValue(null as any);
    expect((await GET(jsonReq('GET', undefined, url))).status).toBe(401);
  });

  it('admin gets every connection in the org (tenant-scoped) + canManage', async () => {
    mockAuth.mockResolvedValue(sess('admin', 'org-A'));
    prismaMock.serverConnection.findMany.mockResolvedValue([] as any);
    const res = await GET(jsonReq('GET', undefined, url));
    const where = prismaMock.serverConnection.findMany.mock.calls[0][0]!.where as any;
    expect(where.orgId).toBe('org-A');
    const body = await res.json();
    expect(body.canManage).toBe(true);
  });

  it('member sees only granted servers (canManage:false)', async () => {
    mockAuth.mockResolvedValue(sess('member', 'org-A'));
    // visibleServerConnections → no department memberships, no grants → empty set
    prismaMock.departmentMember.findMany.mockResolvedValue([] as any);
    prismaMock.serverAccess.findMany.mockResolvedValue([] as any);
    const res = await GET(jsonReq('GET', undefined, url));
    const body = await res.json();
    expect(body.canManage).toBe(false);
    expect(body.servers).toEqual([]);
  });
});

describe('POST /api/servers', () => {
  it('403 for a non-admin', async () => {
    mockAuth.mockResolvedValue(sess('member', 'org-A'));
    const res = await POST(jsonReq('POST', { name: 'X', host: 'h', username: 'u' }, url));
    expect(res.status).toBe(403);
  });

  it('admin creates: org-stamped, password encrypted at rest, never echoed', async () => {
    mockAuth.mockResolvedValue(sess('admin', 'org-A'));
    prismaMock.serverConnection.create.mockImplementation((args: any) =>
      Promise.resolve({
        id: 's1',
        orgId: 'org-A',
        name: 'Prod',
        host: '10.0.0.5',
        port: 3389,
        protocol: 'rdp',
        username: 'Administrator',
        secretCipher: args.data.secretCipher,
        domain: null,
        settings: {},
        departmentId: null,
        createdById: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as any,
    );
    const res = await POST(
      jsonReq('POST', { name: 'Prod', host: '10.0.0.5', username: 'Administrator', password: 'sup3r-secret' }, url),
    );
    expect(res.status).toBe(201);
    const data = prismaMock.serverConnection.create.mock.calls[0][0]!.data as any;
    expect(data.orgId).toBe('org-A');
    expect(data.createdById).toBe('u1');
    // encrypted at rest — not the plaintext
    expect(typeof data.secretCipher).toBe('string');
    expect(data.secretCipher.startsWith('v1.')).toBe(true);
    expect(data.secretCipher).not.toContain('sup3r-secret');
    // response is the client-safe view — credentials are never returned
    const body = await res.json();
    expect(body.secretCipher).toBeUndefined();
    expect(body.hasSecret).toBe(true);
    expect(body.username).toBe('Administrator');
  });

  it('400 on a missing required field', async () => {
    mockAuth.mockResolvedValue(sess('admin', 'org-A'));
    expect((await POST(jsonReq('POST', { name: 'X' }, url))).status).toBe(400);
  });
});
