import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveToken } from '@/lib/mcp/auth';
import { rateLimit } from '@/lib/rate-limit';
import { callTool } from '@/lib/mcp/tools';

vi.mock('@/lib/mcp/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/mcp/auth')>()),
  resolveToken: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })) }));
vi.mock('@/lib/mcp/tools', () => ({
  TOOLS: [{ name: 'list_decisions', description: 'd', inputSchema: { type: 'object' } }],
  callTool: vi.fn(async () => 'ok'),
}));

const identity = { tokenId: 'tok1', userId: 'u1', role: 'member', orgId: null, scopes: ['read'] };

beforeEach(() => {
  vi.mocked(resolveToken).mockReset().mockResolvedValue(identity as any);
  vi.mocked(rateLimit).mockReset().mockResolvedValue({ ok: true, retryAfter: 0 });
  vi.mocked(callTool).mockReset().mockResolvedValue('ok');
});

const post = async (body: unknown, auth = 'Bearer gmcp_test') => {
  const { POST } = await import('./route');
  return POST(new Request('http://x/api/mcp', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', authorization: auth },
  }) as any);
};

const call = (name: string) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } });

describe('POST /api/mcp', () => {
  it('refuses a request with no usable token, and says in words how to authenticate', async () => {
    vi.mocked(resolveToken).mockResolvedValue(null);
    const res = await post(call('list_decisions'), 'Bearer nonsense');
    expect(res.status).toBe(401);
    expect(callTool).not.toHaveBeenCalled();
    // No WWW-Authenticate: to an MCP client that header means OAuth, and Claude Desktop
    // then offers a sign-in flow this server does not have.
    expect(res.headers.get('WWW-Authenticate')).toBeNull();
    expect((await res.json()).error.data.how).toMatch(/No sign-in/);
  });

  it('charges the limiter once per message, against the token AND its owner', async () => {
    await post(call('list_decisions'));
    const keys = vi.mocked(rateLimit).mock.calls.map((c) => c[0]);
    expect(keys).toEqual(['mcp:t:tok1', 'mcp:u:u1']);
  });

  it('a batch pays for every message in it — one charge used to buy the whole array', async () => {
    // The hole this closes: one authorised request could dispatch thousands of tool
    // calls in parallel on a single rate-limit charge and exhaust the Prisma pool.
    await post([call('list_decisions'), call('list_decisions'), call('list_decisions')]);
    expect(vi.mocked(rateLimit).mock.calls.filter((c) => c[0] === 'mcp:t:tok1')).toHaveLength(3);
    expect(callTool).toHaveBeenCalledTimes(3);
  });

  it('rejects an oversized batch outright, before any tool runs', async () => {
    const res = await post(Array.from({ length: 21 }, () => call('list_decisions')));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/batch too large/);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('stops mid-batch when the budget runs out instead of running the rest', async () => {
    vi.mocked(rateLimit)
      .mockResolvedValueOnce({ ok: true, retryAfter: 0 })
      .mockResolvedValueOnce({ ok: true, retryAfter: 0 })
      .mockResolvedValue({ ok: false, retryAfter: 7 });
    const res = await post([call('list_decisions'), call('list_decisions')]);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
    expect(callTool).not.toHaveBeenCalled();
  });

  it('answers a notification with 202 and an empty body', async () => {
    const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(202);
  });

  it('rejects a body that is not JSON', async () => {
    const res = await post('{not json', 'Bearer gmcp_test');
    expect(res.status).toBe(400);
  });
});
