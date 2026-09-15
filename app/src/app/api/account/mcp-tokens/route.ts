import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { generateToken } from '@/lib/mcp/auth';
import { publicBaseUrl } from '@/lib/config';

/**
 * A user's own MCP tokens. Personal by design: the token carries its owner's
 * identity into every agent call, so it is created, listed and revoked by that
 * person, not by an admin on their behalf.
 */

const MAX_ACTIVE_TOKENS = 10;

/**
 * The address a client must be pointed at. Taken from the workspace's configured public
 * URL rather than from the browser's location: behind a proxy, an admin panel opened on
 * an internal hostname would otherwise hand out a URL no agent can reach.
 */
async function mcpEndpoint(): Promise<string> {
  const base = (await publicBaseUrl()).replace(/\/+$/, '');
  return `${base}/api/mcp`;
}

export const GET = withRoute('mcp.tokens.list', async () => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const tokens = await prisma.mcpToken.findMany({
    where: { userId: session.user.id, revokedAt: null },
    select: { id: true, name: true, tokenPrefix: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ tokens, mcpUrl: await mcpEndpoint() });
});

export const POST = withRoute('mcp.tokens.create', async (req: NextRequest) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const name = String((body as { name?: unknown }).name || '').trim().slice(0, 60);
  if (!name) return jsonError('invalid_body', 400);

  const active = await prisma.mcpToken.count({ where: { userId: session.user.id, revokedAt: null } });
  if (active >= MAX_ACTIVE_TOKENS) return jsonError('too_many_tokens', 400);

  const { token, tokenHash, tokenPrefix } = generateToken();
  const row = await prisma.mcpToken.create({
    data: { userId: session.user.id, name, tokenHash, tokenPrefix },
    select: { id: true, name: true, tokenPrefix: true, createdAt: true, lastUsedAt: true },
  });
  // The only time the plaintext exists outside the client's config file — so the
  // response carries everything needed to paste a working connection somewhere.
  return NextResponse.json({ token, mcpUrl: await mcpEndpoint(), ...row }, { status: 201 });
});

export const DELETE = withRoute('mcp.tokens.revoke', async (req: NextRequest) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return jsonError('invalid_body', 400);
  // Scoped to the owner: revoking is not an admin action over someone else's agent.
  const { count } = await prisma.mcpToken.updateMany({
    where: { id, userId: session.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!count) return jsonError('not_found', 404);
  return NextResponse.json({ ok: true });
});
