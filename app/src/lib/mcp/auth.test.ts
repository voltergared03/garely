import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { generateToken, hashToken, bearerFrom, resolveToken, TOKEN_PREFIX } from './auth';

vi.mock('@/lib/prisma');
beforeEach(() => { mockReset(prismaMock); });

const row = (over: Record<string, unknown> = {}) => ({
  id: 'tok1', scopes: 'read', revokedAt: null, expiresAt: null, lastUsedAt: new Date(),
  user: { id: 'u1', role: 'member', status: 'active' },
  ...over,
});

describe('MCP token', () => {
  it('mints a prefixed random token and stores only its hash', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashToken(a.token));
    expect(a.tokenHash).not.toContain(a.token.slice(TOKEN_PREFIX.length));
    expect(a.token.startsWith(a.tokenPrefix)).toBe(true);
  });

  it('reads the bearer header, ignoring anything that is not ours', () => {
    expect(bearerFrom(`Bearer ${TOKEN_PREFIX}abc`)).toBe(`${TOKEN_PREFIX}abc`);
    expect(bearerFrom(`bearer ${TOKEN_PREFIX}abc`)).toBe(`${TOKEN_PREFIX}abc`);
    expect(bearerFrom('Bearer some-other-key')).toBeNull();
    expect(bearerFrom('Basic xyz')).toBeNull();
    expect(bearerFrom(null)).toBeNull();
  });

  it('resolves a live token to its owner', async () => {
    prismaMock.mcpToken.findUnique.mockResolvedValue(row() as any);
    const id = await resolveToken(`${TOKEN_PREFIX}live`);
    expect(id).toMatchObject({ tokenId: 'tok1', userId: 'u1', role: 'member', scopes: ['read'] });
  });

  it('refuses a revoked, an expired, and a blocked user\'s token', async () => {
    prismaMock.mcpToken.findUnique.mockResolvedValue(row({ revokedAt: new Date() }) as any);
    expect(await resolveToken(`${TOKEN_PREFIX}x`)).toBeNull();

    prismaMock.mcpToken.findUnique.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1000) }) as any);
    expect(await resolveToken(`${TOKEN_PREFIX}x`)).toBeNull();

    // Blocking an account must cut off its agents too, not just its browser session.
    prismaMock.mcpToken.findUnique.mockResolvedValue(row({ user: { id: 'u1', role: 'member', status: 'disabled' } }) as any);
    expect(await resolveToken(`${TOKEN_PREFIX}x`)).toBeNull();

    prismaMock.mcpToken.findUnique.mockResolvedValue(null as any);
    expect(await resolveToken(`${TOKEN_PREFIX}unknown`)).toBeNull();
    expect(await resolveToken(null)).toBeNull();
  });

  it('stamps lastUsedAt only when it is stale — agents call in bursts', async () => {
    prismaMock.mcpToken.update.mockResolvedValue({} as any);
    prismaMock.mcpToken.findUnique.mockResolvedValue(row({ lastUsedAt: new Date() }) as any);
    await resolveToken(`${TOKEN_PREFIX}x`);
    expect(prismaMock.mcpToken.update).not.toHaveBeenCalled();

    prismaMock.mcpToken.findUnique.mockResolvedValue(row({ lastUsedAt: new Date(Date.now() - 120_000) }) as any);
    await resolveToken(`${TOKEN_PREFIX}x`);
    expect(prismaMock.mcpToken.update).toHaveBeenCalledTimes(1);
  });
});
