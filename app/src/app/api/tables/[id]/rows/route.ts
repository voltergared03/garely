import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { tableForOrg } from '@/lib/base-engine';
import {
  coerceRowData,
  rowMatchesFilters,
  sortRows,
  type FieldLike,
  type FilterCond,
  type SortCond,
} from '@/lib/base-rows';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/tables/[id]/rows?view=<id>&limit=&offset=
// Lists rows, applying the view's filters + sorts app-side (v1 — see base-rows).
// Without ?view, returns all rows in position order.
export const GET = withRoute('rows.list', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id: tableId } = await ctx.params;
  if (!(await tableForOrg(tableId, r.orgId, r.session))) return jsonError('not_found', 404);

  const url = new URL(req.url);
  const viewId = url.searchParams.get('view');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 1000);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const [fields, allRows, view] = await Promise.all([
    prisma.field.findMany({
      where: { tableId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, type: true, options: true },
    }),
    prisma.row.findMany({ where: { tableId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
    viewId ? prisma.view.findFirst({ where: { id: viewId, tableId } }) : Promise.resolve(null),
  ]);

  const fieldLikes: FieldLike[] = fields.map((f) => ({ id: f.id, type: f.type, options: f.options }));
  const cfg = (view?.config ?? {}) as { filters?: FilterCond[]; sorts?: SortCond[] };

  let rows = allRows.map((row) => ({ ...row, data: (row.data ?? {}) as Record<string, unknown> }));
  rows = rows.filter((row) => rowMatchesFilters(row.data, fieldLikes, cfg.filters));
  rows = sortRows(rows, fieldLikes, cfg.sorts);

  const total = rows.length;
  const page = rows.slice(offset, offset + limit);
  return NextResponse.json({ rows: page, total, limit, offset });
});

const createSchema = z.object({ data: z.record(z.string(), z.unknown()).optional() });

// POST /api/tables/[id]/rows — create a row (data validated per field type).
export const POST = withRoute('rows.create', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id: tableId } = await ctx.params;
  if (!(await tableForOrg(tableId, r.orgId, r.session))) return jsonError('not_found', 404);
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);

  const fields = await prisma.field.findMany({
    where: { tableId },
    select: { id: true, type: true, options: true },
  });
  const rowData = coerceRowData(fields, parsed.data.data ?? {});
  const count = await prisma.row.count({ where: { tableId } });
  const row = await prisma.row.create({
    data: { tableId, data: rowData, createdById: r.session.user.id, position: count },
  });
  return NextResponse.json(row, { status: 201 });
});
