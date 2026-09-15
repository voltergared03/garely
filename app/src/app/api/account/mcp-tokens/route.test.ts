import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { requireAuth } from '@/lib/api-auth';
import { hashToken, TOKEN_PREFIX } from '@/lib/mcp/auth';

vi.mock('@/lib/prisma');
vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/config', () => ({ publicBaseUrl: vi.fn(async () => 'https://meet.example.com/') }));

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(requireAuth).mockResolvedValue({ user: { id: 'u1', role: 'member' } } as any);
});

const post = async (body: unknown) => {
  const { POST } = await import('./route');
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) as any, {} as any);
};

describe('POST /api/account/mcp-tokens', () => {
  it('returns the plaintext once, with the address a client must be pointed at', async () => {
    // Handing over a bare secret leaves the person to work out the URL themselves.
    prismaMock.mcpToken.count.mockResolvedValue(0 as any);
    prismaMock.mcpToken.create.mockResolvedValue({ id: 't1', name: 'laptop', tokenPrefix: 'gmcp_ab', createdAt: new Date(), lastUsedAt: null } as any);

    const res = await post({ name: 'laptop' });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.token.startsWith(TOKEN_PREFIX)).toBe(true);
    // The trailing slash of the configured base must not survive into the endpoint.
    expect(body.mcpUrl).toBe('https://meet.example.com/api/mcp');
  });

  it('stores only the hash — the plaintext is never written down', async () => {
    prismaMock.mcpToken.count.mockResolvedValue(0 as any);
    prismaMock.mcpToken.create.mockResolvedValue({ id: 't1', name: 'x', tokenPrefix: 'gmcp_ab', createdAt: new Date(), lastUsedAt: null } as any);

    const body = await (await post({ name: 'x' })).json();
    const written = (prismaMock.mcpToken.create.mock.calls[0][0] as any).data;

    expect(written.tokenHash).toBe(hashToken(body.token));
    expect(JSON.stringify(written)).not.toContain(body.token);
    expect(written.userId).toBe('u1');
  });

  it('refuses a nameless token and stops at ten live ones', async () => {
    prismaMock.mcpToken.count.mockResolvedValue(0 as any);
    expect((await post({ name: '  ' })).status).toBe(400);
    expect(prismaMock.mcpToken.create).not.toHaveBeenCalled();

    prismaMock.mcpToken.count.mockResolvedValue(10 as any);
    expect((await post({ name: 'eleventh' })).status).toBe(400);
    expect(prismaMock.mcpToken.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/account/mcp-tokens', () => {
  it('revokes only your own token — not somebody else\'s agent', async () => {
    const { DELETE } = await import('./route');
    prismaMock.mcpToken.updateMany.mockResolvedValue({ count: 1 } as any);
    const res = await DELETE(new Request('http://x/api/account/mcp-tokens?id=t1', { method: 'DELETE' }) as any, {} as any);
    expect(res.status).toBe(200);
    const where = (prismaMock.mcpToken.updateMany.mock.calls[0][0] as any).where;
    expect(where).toMatchObject({ id: 't1', userId: 'u1', revokedAt: null });
  });

  it('404s when the token is not yours, instead of reporting success', async () => {
    const { DELETE } = await import('./route');
    prismaMock.mcpToken.updateMany.mockResolvedValue({ count: 0 } as any);
    const res = await DELETE(new Request('http://x/api/account/mcp-tokens?id=someone-elses', { method: 'DELETE' }) as any, {} as any);
    expect(res.status).toBe(404);
  });
});
