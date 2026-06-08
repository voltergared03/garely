import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { userCanAccessServer } from '@/lib/server-access';
import { decryptServerSecret } from '@/lib/server-credentials';
import { rdpGatewayEnabled, rdpGatewayUrl, rdpDelegationPubKey } from '@/lib/rdp-gateway';
import { mintConnectionToken } from '@/lib/rdp-token';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/servers/[id]/connect — issue a short-lived gateway connection token for
// a server the caller may access. The vault password is decrypted server-side and
// injected via the (JWE-encrypted) token; it never reaches the browser in the clear.
export const POST = withRoute('servers.connect', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const conn = await prisma.serverConnection.findFirst({ where: { id, orgId: r.orgId } });
  if (!conn) return jsonError('not_found', 404);
  if (!(await userCanAccessServer(id, r.session.user.id, r.session.user.role))) {
    return jsonError('forbidden', 403);
  }
  if (!rdpGatewayEnabled()) return jsonError('gateway_unconfigured', 503);

  const password = decryptServerSecret(conn.secretCipher); // '' when no stored secret
  const wantInject = !!password;
  // Never ship credentials the gateway can't protect (would be readable in the browser).
  if (wantInject && !rdpDelegationPubKey()) return jsonError('gateway_delegation_unconfigured', 503);

  const dstUser = conn.domain ? `${conn.domain}\\${conn.username}` : conn.username;
  const token = await mintConnectionToken({
    host: conn.host,
    port: conn.port,
    dstUser: wantInject ? dstUser : undefined,
    dstPassword: wantInject ? password : undefined,
  });

  // Audit: open a session row (the gateway closes it with byte counts + end time).
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
  const sess = await prisma.serverSession.create({
    data: { connectionId: conn.id, userId: r.session.user.id, orgId: r.orgId, status: 'active', clientIp },
    select: { id: true },
  });

  return NextResponse.json({
    gatewayUrl: rdpGatewayUrl(),
    token,
    sessionId: sess.id,
    destination: `${conn.host}:${conn.port}`,
    injected: wantInject,
  });
});
