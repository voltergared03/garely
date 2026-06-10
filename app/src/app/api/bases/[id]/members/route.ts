import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { baseForOrg, basePermission, canTransferBase } from '@/lib/base-engine';

type Ctx = { params: Promise<{ id: string }> };
const userSel = { id: true, name: true, image: true, email: true };

// GET /api/bases/[id]/members — sharing state: visibility, owner, members
// (with role + hidden fields), and the base's fields (for the hide-columns UI).
export const GET = withRoute('base.members.list', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  const perm = await basePermission(base, r.orgId, r.session);
  const [memberRows, tables] = await Promise.all([
    prisma.baseMember.findMany({ where: { baseId: id }, include: { user: { select: userSel } }, orderBy: { createdAt: 'asc' } }),
    prisma.table.findMany({
      where: { baseId: id },
      orderBy: { position: 'asc' },
      select: { name: true, fields: { select: { id: true, name: true }, orderBy: { position: 'asc' } } },
    }),
  ]);
  return NextResponse.json({
    visibility: base.visibility,
    ownerId: base.createdById,
    canManage: perm.level === 'admin',
    canTransfer: canTransferBase(base, r.session),
    members: memberRows.map((m) => ({
      ...m.user,
      role: m.role,
      hiddenFields: Array.isArray(m.hiddenFields) ? (m.hiddenFields as string[]) : [],
    })),
    fields: tables.flatMap((tb) => tb.fields.map((f) => ({ id: f.id, name: f.name, tableName: tb.name }))),
  });
});

const addSchema = z.object({
  email: z.string().trim().min(1).optional(),
  userId: z.string().min(1).optional(),
  role: z.enum(['viewer', 'editor', 'admin']).optional(),
});

// POST { email | userId, role? } — grant access to an existing org member.
export const POST = withRoute('base.members.add', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  if ((await basePermission(base, r.orgId, r.session)).level !== 'admin') return jsonError('forbidden', 403);
  const parsed = addSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || (!parsed.data.email && !parsed.data.userId)) return jsonError('invalid_body', 400);

  const user = parsed.data.userId
    ? await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: userSel })
    : await prisma.user.findUnique({ where: { email: parsed.data.email!.toLowerCase() }, select: userSel });
  if (!user) return jsonError('not_in_workspace', 404);
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: r.orgId, userId: user.id } },
    select: { id: true },
  });
  if (!membership) return jsonError('not_in_workspace', 404);

  const role = parsed.data.role ?? 'editor';
  const m = await prisma.baseMember.upsert({
    where: { baseId_userId: { baseId: id, userId: user.id } },
    update: { role },
    create: { baseId: id, userId: user.id, role },
  });
  return NextResponse.json({ ...user, role: m.role, hiddenFields: [] }, { status: 201 });
});
