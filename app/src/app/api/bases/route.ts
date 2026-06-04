import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';

// GET /api/bases — list the org's bases.
export const GET = withRoute('bases.list', async () => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const bases = await prisma.base.findMany({
    where: { orgId: r.orgId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { tables: true } } },
  });
  return NextResponse.json(
    bases.map((b) => ({
      id: b.id,
      name: b.name,
      icon: b.icon,
      color: b.color,
      tableCount: b._count.tables,
      createdAt: b.createdAt,
    })),
  );
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(40).nullish(),
  color: z.string().trim().max(20).nullish(),
});

// POST /api/bases — create a base in the current org.
export const POST = withRoute('bases.create', async (req: NextRequest) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('invalid_body', 400);
  const count = await prisma.base.count({ where: { orgId: r.orgId } });
  const base = await prisma.base.create({
    data: {
      orgId: r.orgId,
      name: parsed.data.name,
      icon: parsed.data.icon ?? null,
      color: parsed.data.color ?? null,
      createdById: r.session.user.id,
      position: count,
    },
  });
  return NextResponse.json(base, { status: 201 });
});
