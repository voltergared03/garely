import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError, jsonOk } from '@/lib/http';
import { baseForOrg, gate } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/bases/[id] — base + its tables (any access level).
export const GET = withRoute('bases.get', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  const tables = await prisma.table.findMany({
    where: { baseId: id },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, icon: true, position: true, primaryFieldId: true },
  });
  return NextResponse.json({ ...base, tables });
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    icon: z.string().trim().max(40).nullish(),
    color: z.string().trim().max(20).nullish(),
    visibility: z.enum(['org', 'restricted']).optional(),
    position: z.number().int().optional(),
  })
  .strict();

// PATCH — base settings (rename / color / visibility): admin only.
export const PATCH = withRoute('bases.update', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const acc = await baseForOrg(id, r.orgId, r.session);
  if (!acc) return jsonError('not_found', 404);
  const g = await gate(acc, r.orgId, r.session, 'admin');
  if (g) return g;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const base = await prisma.base.update({ where: { id }, data: parsed.data });
  return NextResponse.json(base);
});

// DELETE — admin only (cascades tables → fields/rows/views/members).
export const DELETE = withRoute('bases.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const acc = await baseForOrg(id, r.orgId, r.session);
  if (!acc) return jsonError('not_found', 404);
  const g = await gate(acc, r.orgId, r.session, 'admin');
  if (g) return g;
  await prisma.base.delete({ where: { id } });
  return jsonOk();
});
