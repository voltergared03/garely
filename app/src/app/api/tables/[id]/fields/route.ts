import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { tableForOrg, gate, fieldTypeSchema, normalizeFieldOptions } from '@/lib/base-engine';
import { ensureReverseLink } from '@/lib/base-link-sync';

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
  // Two-way links: pair with (or create) a reverse link field in the target table.
  if (field.type === 'link') {
    const src = await prisma.table.findUnique({ where: { id: tableId }, select: { name: true, primaryFieldId: true } });
    if (src) {
      await ensureReverseLink({ id: field.id, tableId, options: field.options }, src);
      const refreshed = await prisma.field.findUnique({ where: { id: field.id } });
      if (refreshed) return NextResponse.json(refreshed, { status: 201 });
    }
  }
  return NextResponse.json(field, { status: 201 });
});
