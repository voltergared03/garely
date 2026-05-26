import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { getAuthConfig } from '@/lib/config';
import { mockSession, jsonReq } from '@/test/helpers';
import { POST } from '@/app/api/users/invite/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(async () => ({})),
  CONFIG_DEFAULTS: { WS_TIMEZONE: 'UTC', WS_LANGUAGE: 'en', WS_NAME: 'EAM' },
  publicBaseUrl: vi.fn(async () => 'https://meet.example.com'),
  getAuthConfig: vi.fn(async () => ({ passwordEnabled: false })),
}));
const tr: any = (k: string) => k;
tr.rich = (k: string) => k;
vi.mock('@/lib/i18n-server', () => ({
  getTranslator: vi.fn(() => tr),
  workspaceLocale: vi.fn(async () => 'en'),
  resolveUserLocale: vi.fn(async () => 'en'),
}));

const mockAuth = vi.mocked(auth);
const mockAuthCfg = vi.mocked(getAuthConfig);

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
  mockAuthCfg.mockReset();
  mockAuthCfg.mockResolvedValue({ passwordEnabled: false } as any);
});

describe('POST /api/users/invite', () => {
  it('403 when the caller is not an admin', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST(jsonReq('POST', { email: 'a@b.com' }))).status).toBe(403);
    mockAuth.mockResolvedValue(mockSession({ role: 'member' }));
    expect((await POST(jsonReq('POST', { email: 'a@b.com' }))).status).toBe(403);
  });

  it('400 for an invalid email', async () => {
    mockAuth.mockResolvedValue(mockSession({ role: 'admin' }));
    expect((await POST(jsonReq('POST', { email: 'not-an-email' }))).status).toBe(400);
  });

  it('updates the role of an existing user (no create)', async () => {
    mockAuth.mockResolvedValue(mockSession({ role: 'admin' }));
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    prismaMock.user.update.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'member' } as any);

    const j = await (await POST(jsonReq('POST', { email: 'a@b.com', role: 'member' }))).json();
    expect(j.success).toBe(true);
    expect(j.created).toBe(false);
    expect(prismaMock.user.update).toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('creates a new user and, with password auth off, mints no token', async () => {
    mockAuth.mockResolvedValue(mockSession({ role: 'admin' }));
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    prismaMock.user.create.mockResolvedValue({ id: 'u2', email: 'new@b.com', role: 'member' } as any);

    const j = await (await POST(jsonReq('POST', { email: 'new@b.com' }))).json();
    expect(j.created).toBe(true);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it('mints a set-password token when password auth is on and the user has none', async () => {
    mockAuth.mockResolvedValue(mockSession({ role: 'admin' }));
    mockAuthCfg.mockResolvedValue({ passwordEnabled: true } as any);
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    prismaMock.user.create.mockResolvedValue({ id: 'u3', email: 'pw@b.com', role: 'member' } as any);
    prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.verificationToken.create.mockResolvedValue({} as any);

    await POST(jsonReq('POST', { email: 'pw@b.com' }));
    expect(prismaMock.verificationToken.create).toHaveBeenCalled();
    const arg = prismaMock.verificationToken.create.mock.calls[0][0];
    expect(arg.data.identifier).toBe('pw@b.com');
    expect(typeof arg.data.token).toBe('string');
  });

  it('coerces an unknown role to member', async () => {
    mockAuth.mockResolvedValue(mockSession({ role: 'admin' }));
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    prismaMock.user.create.mockResolvedValue({ id: 'u4', email: 'x@b.com', role: 'member' } as any);
    await POST(jsonReq('POST', { email: 'x@b.com', role: 'superuser' }));
    expect(prismaMock.user.create.mock.calls[0][0].data.role).toBe('member');
  });
});
