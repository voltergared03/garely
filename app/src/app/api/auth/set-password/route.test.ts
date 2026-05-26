import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { hashPassword, passwordPolicyError } from '@/lib/password';
import { rateLimit } from '@/lib/rate-limit';
import { jsonReq } from '@/test/helpers';
import { GET, POST } from '@/app/api/auth/set-password/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn(),
  passwordPolicyError: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn() }));

const mockHash = vi.mocked(hashPassword);
const mockPolicy = vi.mocked(passwordPolicyError);
const mockRate = vi.mocked(rateLimit);

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

beforeEach(() => {
  mockReset(prismaMock);
  mockHash.mockReset();
  mockPolicy.mockReset();
  mockRate.mockReset();
  mockRate.mockReturnValue({ ok: true } as any);
  mockHash.mockResolvedValue('hashed-pw');
  mockPolicy.mockReturnValue(null);
});

const getReq = (token?: string) =>
  jsonReq(
    'GET',
    undefined,
    token === undefined
      ? 'http://localhost/api/auth/set-password'
      : `http://localhost/api/auth/set-password?token=${encodeURIComponent(token)}`,
  );

describe('GET /api/auth/set-password', () => {
  it('400 when no token is given', async () => {
    const r = await GET(getReq());
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false });
  });

  it('{ ok: false } when the token is unknown', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue(null as any);
    expect(await (await GET(getReq('nope'))).json()).toEqual({ ok: false });
  });

  it('{ ok: false } when the token is expired', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      identifier: 'a@b.com', token: 't', expires: past(),
    } as any);
    expect(await (await GET(getReq('t'))).json()).toEqual({ ok: false });
  });

  it('{ ok: false } when no user matches the token email', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      identifier: 'a@b.com', token: 't', expires: future(),
    } as any);
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    expect(await (await GET(getReq('t'))).json()).toEqual({ ok: false });
  });

  it('{ ok: true, email } for a valid token', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      identifier: 'a@b.com', token: 't', expires: future(),
    } as any);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
    expect(await (await GET(getReq('t'))).json()).toEqual({ ok: true, email: 'a@b.com' });
  });
});

describe('POST /api/auth/set-password', () => {
  const body = { token: 't', password: 'Sup3rSecret!' };

  it('429 when rate-limited', async () => {
    mockRate.mockReturnValue({ ok: false } as any);
    expect((await POST(jsonReq('POST', body))).status).toBe(429);
  });

  it('400 invalid_token when the token is unknown', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue(null as any);
    const r = await POST(jsonReq('POST', body));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('invalid_token');
  });

  it('400 when the token is expired', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      identifier: 'a@b.com', token: 't', expires: past(),
    } as any);
    expect((await POST(jsonReq('POST', body))).status).toBe(400);
  });

  it('rejects a weak password with the policy error', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      identifier: 'a@b.com', token: 't', expires: future(),
    } as any);
    mockPolicy.mockReturnValue('too_short');
    const r = await POST(jsonReq('POST', { token: 't', password: 'x' }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('too_short');
  });

  it('400 invalid_token when the user no longer exists', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      identifier: 'a@b.com', token: 't', expires: future(),
    } as any);
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    expect((await POST(jsonReq('POST', body))).status).toBe(400);
  });

  it('sets the password, activates the user, and burns all tokens for the email', async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      identifier: 'a@b.com', token: 't', expires: future(),
    } as any);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
    prismaMock.user.update.mockResolvedValue({} as any);
    prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 1 } as any);

    const r = await POST(jsonReq('POST', body));
    expect(await r.json()).toEqual({ ok: true, email: 'a@b.com' });

    const updateArg = prismaMock.user.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'u1' });
    expect(updateArg.data).toMatchObject({
      passwordHash: 'hashed-pw',
      mustChangePassword: false,
      status: 'active',
    });
    expect(prismaMock.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: 'a@b.com' },
    });
  });
});
