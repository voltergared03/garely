import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { rowForOrg, basePermission, atLeast } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/rows/[id]/comments — list a row's comments (any base access).
export const GET = withRoute('rowComments.list', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);
  const perm = await basePermission(row.table.base, r.orgId, r.session);
  const isAdmin = atLeast(perm.level, 'admin');
  const comments = await prisma.rowComment.findMany({ where: { rowId: id }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.authorName,
      userId: c.userId,
      createdAt: c.createdAt,
      canDelete: isAdmin || c.userId === r.session.user.id,
    })),
  });
});

const createSchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();

// POST /api/rows/[id]/comments — add a comment. Anyone with base access (incl.
// viewers) can comment; rowForOrg already enforced that access.
export const POST = withRoute('rowComments.create', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const c = await prisma.rowComment.create({
    data: {
      rowId: id,
      userId: r.session.user.id,
      authorName: r.session.user.name ?? r.session.user.email ?? null,
      body: parsed.data.body,
    },
  });
  return NextResponse.json(
    { id: c.id, body: c.body, authorName: c.authorName, userId: c.userId, createdAt: c.createdAt, canDelete: true },
    { status: 201 },
  );
});
