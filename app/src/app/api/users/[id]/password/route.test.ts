import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { generateTempPassword, hashPassword } from '@/lib/password';
import { mockSession, jsonReq, ctx } from '@/test/helpers';
import { POST } from '@/app/api/users/[id]/password/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/password', () => ({
  generateTempPassword: vi.fn(() => 'Temp-1234!'),
  hashPassword: vi.fn(async () => 'hashed-pw'),
}));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(async () => ({})),
  CONFIG_DEFAULTS: { WS_NAME: 'EAM' },
  publicBaseUrl: vi.fn(async () => 'https://meet.example.com'),
}));
const tr: any = (k: string) => k;
tr.rich = (k: string) => k;
vi.mock('@/lib/i18n-server', () => ({
  getTranslator: vi.fn(() => tr),
  workspaceLocale: vi.fn(async () => 'en'),
  resolveUserLocale: vi.fn(async () => 'en'),
}));

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
  vi.mocked(generateTempPassword).mockClear();
  vi.mocked(hashPassword).mockClear();
});

describe('POST /api/users/[id]/password', () => {
  it('403 when the caller is not an admin', async () => {
    mockAuth.mockResolvedValue(mockSession({ role: 'member' }));
    expect((await POST(jsonReq('POST'), ctx({ id: 'u1' }))).status).toBe(403);
  });

  it('404 when the target user does not exist', async () => {
    mockAuth.mockResolvedValue(mockSession({ role: 'admin' }));
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    expect((await POST(jsonReq('POST'), ctx({ id: 'ghost' }))).status).toBe(404);
  });

  it('resets the password and forces a change on next login', async () => {
    mockAuth.mockResolvedValue(mockSession({ role: 'admin' }));
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'A' } as any);
    prismaMock.user.update.mockResolvedValue({} as any);

    const r = await POST(jsonReq('POST'), ctx({ id: 'u1' }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.password).toBe('Temp-1234!');

    const updateArg = prismaMock.user.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'u1' });
    expect(updateArg.data).toMatchObject({ passwordHash: 'hashed-pw', mustChangePassword: true });
  });
});
