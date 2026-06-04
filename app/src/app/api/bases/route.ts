import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';

// GET /api/bases — list the org's bases.
export const GET = withRoute('bases.list', async () => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const uid = r.session.user.id;
  const where: Prisma.BaseWhereInput =
    r.session.user.role === 'admin'
      ? { orgId: r.orgId }
      : {
          orgId: r.orgId,
          OR: [
            { visibility: { not: 'restricted' } },
            { createdById: uid },
            { members: { some: { userId: uid } } },
          ],
        };
  const bases = await prisma.base.findMany({
    where,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: {
      _count: { select: { tables: true } },
      tables: { select: { name: true }, orderBy: { position: 'asc' }, take: 5 },
    },
  });
  return NextResponse.json(
    bases.map((b) => ({
      id: b.id,
      name: b.name,
      icon: b.icon,
      color: b.color,
      visibility: b.visibility,
      mine: b.createdById === uid,
      tableCount: b._count.tables,
      tables: b.tables.map((t) => t.name),
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
