import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { tableForOrg, canTransferTable } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ userId: z.string().min(1) }).strict();

// POST /api/tables/[id]/transfer { userId } — hand a table to another org member.
// Allowed by the current table owner, a base-admin, or a workspace admin. The new
// owner becomes the table's manager (rename/delete/structure/transfer); base-level
// access (who can SEE/edit rows) is unchanged. The recipient must be an org member.
export const POST = withRoute('tables.transfer', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const t = await tableForOrg(id, r.orgId, r.session);
  if (!t) return jsonError('not_found', 404);
  if (t.system) return jsonError('forbidden', 403); // app-managed table — no ownership
  if (!canTransferTable(t, t.base, r.session)) return jsonError('forbidden', 403);

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const { userId } = parsed.data;

  // Recipient must belong to this org.
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: r.orgId, userId } },
    select: { id: true },
  });
  if (!membership) return jsonError('not_in_workspace', 404);

  await prisma.table.update({ where: { id }, data: { createdById: userId } });
  return jsonOk({ ownerId: userId });
});
