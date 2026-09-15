import { createHash, randomBytes } from 'crypto';
import type { Session } from 'next-auth';
import { prisma } from '../prisma';

/**
 * Personal access tokens for the MCP endpoint.
 *
 * The token IS the person: every tool call runs as its owner and sees exactly what
 * that user sees in the web UI. An org-wide key would hand whoever pasted it into
 * their agent every meeting in the workspace, including the ones they were never in.
 *
 * Stored as a SHA-256 hash, not a password hash: the token is 32 random bytes, so
 * there is nothing to brute-force, and a fast hash keeps the lookup a single indexed
 * read on every request. The plaintext is shown once at creation and never again.
 */

export const TOKEN_PREFIX = 'gmcp_';

export interface McpIdentity {
  tokenId: string;
  userId: string;
  role: string;
  orgId: string | null;
  scopes: string[];
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Mint a new token. Returns the plaintext (show once) plus what to store. */
export function generateToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token), tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 6) };
}

/** Pull the bearer credential out of an Authorization header. */
export function bearerFrom(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = m?.[1]?.trim();
  return token && token.startsWith(TOKEN_PREFIX) ? token : null;
}

/** Only bump lastUsedAt when it is meaningfully stale — agents call in bursts. */
const LAST_USED_THROTTLE_MS = 60_000;

/**
 * Resolve a bearer token to its owner. Returns null for anything that must not pass:
 * unknown, revoked, expired, or a token whose owner has been blocked — the same gate
 * the web session checks, so disabling an account cuts off their agents too.
 */
export async function resolveToken(token: string | null): Promise<McpIdentity | null> {
  if (!token) return null;
  const row = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true, scopes: true, revokedAt: true, expiresAt: true, lastUsedAt: true,
      user: { select: { id: true, role: true, status: true } },
    },
  });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  if (!row.user || row.user.status === 'disabled') return null;

  const stale = !row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
  if (stale) {
    await prisma.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }

  return {
    tokenId: row.id,
    userId: row.user.id,
    role: row.user.role,
    orgId: null,
    scopes: row.scopes.split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/**
 * A session object shaped like the one the web app passes around, so MCP tools can
 * reuse `listTasks` / `listDecisions` and every other helper verbatim instead of
 * growing a second, divergent authorization path.
 */
export function sessionFor(id: McpIdentity): Session {
  return { user: { id: id.userId, role: id.role, status: 'active' } } as unknown as Session;
}
