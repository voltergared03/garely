import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ sessionId: z.string().min(1) });

// POST /api/servers/[id]/heartbeat — the live client pings this every ~30s to keep
// its audit session marked "in use". Owner-scoped + idempotent. When the beats stop
// (tab closed, crash, disconnect), lastSeenAt goes stale and the presence view drops
// the session within PRESENCE_STALE_MS — so occupancy never lingers on a dead tab.
export const POST = withRoute('servers.heartbeat', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('bad_request', 400);

  await prisma.serverSession.updateMany({
    where: {
      id: parsed.data.sessionId,
      connectionId: id,
      orgId: r.orgId,
      userId: r.session.user.id,
      status: 'active',
    },
    data: { lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
});
