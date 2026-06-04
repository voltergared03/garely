import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { tableForOrg, gate, fieldTypeSchema, normalizeFieldOptions } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: fieldTypeSchema,
  options: z.unknown().optional(),
});

// POST /api/tables/[id]/fields — add a column (editor+).
export const POST = withRoute('fields.create', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id: tableId } = await ctx.params;
  const t = await tableForOrg(tableId, r.orgId, r.session);
  if (!t) return jsonError('not_found', 404);
  const g = await gate(t.base, r.orgId, r.session, 'editor');
  if (g) return g;
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const count = await prisma.field.count({ where: { tableId } });
  const field = await prisma.field.create({
    data: { tableId, name: parsed.data.name, type: parsed.data.type, options: normalizeFieldOptions(parsed.data.type, parsed.data.options), position: count },
  });
  return NextResponse.json(field, { status: 201 });
});
