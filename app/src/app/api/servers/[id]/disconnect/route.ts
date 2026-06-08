import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ sessionId: z.string().min(1) });

// POST /api/servers/[id]/disconnect — mark the caller's own audit session ended.
// The gateway will eventually close sessions with byte counts; until that wiring
// lands, the client reports its own teardown so the live/usage view stays honest.
// Owner-scoped + idempotent (updateMany only touches an active row the caller owns).
export const POST = withRoute('servers.disconnect', async (req: NextRequest, ctx: Ctx) => {
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
    data: { status: 'ended', endedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
});
