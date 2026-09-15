import { NextResponse, type NextRequest } from 'next/server';
import { withRoute } from '@/lib/with-route';
import { rateLimit } from '@/lib/rate-limit';
import { bearerFrom, resolveToken, type McpIdentity } from '@/lib/mcp/auth';
import { handleRpc, type RpcRequest } from '@/lib/mcp/protocol';
import { TOOLS, callTool } from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/mcp — the Model Context Protocol endpoint. Point Claude (or any MCP
 * client) at it with a personal token and it can read this workspace's meetings.
 *
 * Stateless: one JSON-RPC message in, one response out, no session kept. That is
 * what survives nginx's 60-second and Cloudflare's 100-second read timeouts, which
 * a long-lived SSE stream would not.
 *
 * The token identifies a person, so every answer is scoped to what that person can
 * open in the web UI. Read-only by design: there is no tool here that writes.
 */

const SERVER_VERSION = '1.0';
/** Per token, and per person: minting a second token must not buy a second budget. */
const CALLS_PER_MINUTE = 120;
const USER_CALLS_PER_MINUTE = 300;
/**
 * A JSON-RPC array used to be one rate-limit charge for any number of messages, so a
 * single authorised request could dispatch thousands of tool calls at once and exhaust
 * the Prisma pool. Batching was dropped from the protocol in 2025-06-18 anyway; a small
 * cap keeps older clients working without leaving an amplifier behind.
 */
const MAX_BATCH = 20;

/** One unit of work = one charge, against both the token's budget and its owner's. */
async function charge(identity: McpIdentity) {
  const perToken = await rateLimit(`mcp:t:${identity.tokenId}`, CALLS_PER_MINUTE, 60_000);
  if (!perToken.ok) return perToken;
  return rateLimit(`mcp:u:${identity.userId}`, USER_CALLS_PER_MINUTE, 60_000);
}

function limited(retryAfter: number) {
  return NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32029, message: 'rate limited, retry shortly' } },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

/**
 * Deliberately WITHOUT a `WWW-Authenticate` header. To an MCP client that header is the
 * OAuth signal: Claude Desktop saw it and offered "Sign in now — Detected", which would
 * then fail, because this server has no OAuth flow and every discovery path 404s. It
 * authenticates with a personal token instead, so the 401 says that in words.
 */
function unauthorized(message: string) {
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message,
        data: {
          how: 'Create a personal token in Garely under Settings → Profile → Connect an AI agent, then send it as the header: Authorization: Bearer <token>. This server uses a token, not OAuth — in a connector dialog choose "No sign-in" and add that header.',
        },
      },
    },
    { status: 401 },
  );
}

export const POST = withRoute('mcp.rpc', async (req: NextRequest) => {
  const identity = await resolveToken(bearerFrom(req.headers.get('authorization')));
  if (!identity) return unauthorized('missing or invalid MCP token');

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'invalid JSON' } },
      { status: 400 },
    );
  }

  const batch = Array.isArray(payload) ? payload : null;
  if (batch && batch.length > MAX_BATCH) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32600, message: `batch too large (max ${MAX_BATCH} messages)` } },
      { status: 400 },
    );
  }

  // Agents retry hard; one client must not be able to saturate Postgres. Every message
  // in a batch pays, so a batch costs what it actually consumes.
  for (let i = 0; i < (batch ? Math.max(1, batch.length) : 1); i++) {
    const gate = await charge(identity);
    if (!gate.ok) return limited(gate.retryAfter);
  }

  const ctx = {
    version: SERVER_VERSION,
    tools: TOOLS,
    callTool: (name: string, args: Record<string, unknown>) => callTool(identity, name, args),
  };

  // Older clients may still batch; newer ones send one message at a time. Sequential,
  // so one request cannot hold more than one connection of the shared pool at a time.
  if (batch) {
    const answers = [];
    for (const m of batch) {
      const a = await handleRpc(m as RpcRequest, ctx);
      if (a) answers.push(a);
    }
    return answers.length ? NextResponse.json(answers) : new NextResponse(null, { status: 202 });
  }

  const answer = await handleRpc(payload as RpcRequest, ctx);
  return answer ? NextResponse.json(answer) : new NextResponse(null, { status: 202 });
});

/** No server-initiated stream: clients that probe for SSE should fall back to POST. */
export const GET = withRoute('mcp.sse', async () =>
  NextResponse.json({ error: 'this MCP server is POST-only (stateless JSON-RPC)' }, { status: 405 }));
