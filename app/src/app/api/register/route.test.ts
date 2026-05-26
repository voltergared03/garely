import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { passwordPolicyError } from '@/lib/password';
import { getAuthConfig, emailAllowedForSelfReg } from '@/lib/config';
import { rateLimit } from '@/lib/rate-limit';
import { jsonReq } from '@/test/helpers';
import { POST } from '@/app/api/register/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn(async () => 'hashed'),
  passwordPolicyError: vi.fn(() => null),
}));
vi.mock('@/lib/config', () => ({
  getAuthConfig: vi.fn(async () => ({ selfReg: true, selfRegDomains: [], requestTtlDays: 7 })),
  emailAllowedForSelfReg: vi.fn(() => true),
  publicBaseUrl: vi.fn(async () => 'https://meet.example.com'),
}));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => {}) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => ({ ok: true })) }));
vi.mock('@/lib/i18n-server', () => ({
  getTranslator: vi.fn(() => (k: string) => k),
  workspaceLocale: vi.fn(async () => 'en'),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (k: string) => k),
}));

const mockRate = vi.mocked(rateLimit);
const mockAuthCfg = vi.mocked(getAuthConfig);
const mockPolicy = vi.mocked(passwordPolicyError);
const mockDomain = vi.mocked(emailAllowedForSelfReg);

beforeEach(() => {
  mockReset(prismaMock);
  mockRate.mockReset();
  mockRate.mockReturnValue({ ok: true } as any);
  mockAuthCfg.mockReset();
  mockAuthCfg.mockResolvedValue({ selfReg: true, selfRegDomains: [], requestTtlDays: 7 } as any);
  mockPolicy.mockReset();
  mockPolicy.mockReturnValue(null);
  mockDomain.mockReset();
  mockDomain.mockReturnValue(true);
});

const reg = (b: any = { email: 'new@b.com', name: 'N', password: 'Sup3rSecret!' }) =>
  jsonReq('POST', b, 'http://localhost/api/register');

describe('POST /api/register', () => {
  it('429 when rate-limited', async () => {
    mockRate.mockReturnValue({ ok: false } as any);
    expect((await POST(reg())).status).toBe(429);
  });

  it('403 when self-registration is disabled', async () => {
    mockAuthCfg.mockResolvedValue({ selfReg: false } as any);
    expect((await POST(reg())).status).toBe(403);
  });

  it('400 for an invalid email', async () => {
    expect((await POST(reg({ email: 'bad', password: 'Sup3rSecret!' }))).status).toBe(400);
  });

  it('400 when the email domain is not allowed', async () => {
    mockDomain.mockReturnValue(false);
    expect((await POST(reg())).status).toBe(400);
  });

  it('400 for a weak password', async () => {
    mockPolicy.mockReturnValue('too_short');
    const r = await POST(reg({ email: 'new@b.com', password: 'x' }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('too_short');
  });

  it('anti-enumeration: an existing email returns ok WITHOUT creating a request', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
    const r = await POST(reg());
    expect(await r.json()).toEqual({ ok: true });
    expect(prismaMock.registrationRequest.upsert).not.toHaveBeenCalled();
  });

  it('creates a pending request for a new email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    prismaMock.registrationRequest.upsert.mockResolvedValue({} as any);
    prismaMock.user.findMany.mockResolvedValue([] as any);
    const r = await POST(reg());
    expect(await r.json()).toEqual({ ok: true });
    expect(prismaMock.registrationRequest.upsert).toHaveBeenCalled();
  });
});
