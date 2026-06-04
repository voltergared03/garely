import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { baseForOrg } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(40).nullish(),
});

// POST /api/bases/[id]/tables — create a table, bootstrapped with a primary
// text field ("Name") and a default grid view so it's immediately usable.
export const POST = withRoute('tables.create', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id: baseId } = await ctx.params;
  if (!(await baseForOrg(baseId, r.orgId, r.session))) return jsonError('not_found', 404);
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const count = await prisma.table.count({ where: { baseId } });
  const created = await prisma.$transaction(async (tx) => {
    const table = await tx.table.create({
      data: { baseId, name: parsed.data.name, icon: parsed.data.icon ?? null, position: count },
    });
    const field = await tx.field.create({
      data: { tableId: table.id, name: 'Name', type: 'text', position: 0 },
    });
    await tx.table.update({ where: { id: table.id }, data: { primaryFieldId: field.id } });
    const view = await tx.view.create({
      data: {
        tableId: table.id,
        name: 'Grid',
        type: 'grid',
        position: 0,
        config: { visibleFieldIds: [field.id] },
      },
    });
    return { table: { ...table, primaryFieldId: field.id }, field, view };
  });
  return NextResponse.json(created, { status: 201 });
});
