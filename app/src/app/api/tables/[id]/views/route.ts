import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { tableForOrg, gate } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['grid', 'kanban', 'calendar']).default('grid'),
  config: z.record(z.string(), z.unknown()).optional(),
});

// POST /api/tables/[id]/views — add a view (editor+).
export const POST = withRoute('views.create', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id: tableId } = await ctx.params;
  const t = await tableForOrg(tableId, r.orgId, r.session);
  if (!t) return jsonError('not_found', 404);
  const g = await gate(t.base, r.orgId, r.session, 'editor');
  if (g) return g;
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const count = await prisma.view.count({ where: { tableId } });
  const view = await prisma.view.create({
    data: { tableId, name: parsed.data.name, type: parsed.data.type, config: (parsed.data.config ?? {}) as Prisma.InputJsonValue, position: count },
  });
  return NextResponse.json(view, { status: 201 });
});
