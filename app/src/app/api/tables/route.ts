import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';

// GET /api/tables — every table in the org the caller can access, with its base
// name (for the link-field target picker). Mirrors the /api/bases access filter.
export const GET = withRoute('tables.listAll', async () => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const uid = r.session.user.id;
  const baseWhere: Prisma.BaseWhereInput =
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
  const tables = await prisma.table.findMany({
    where: { base: baseWhere },
    orderBy: [{ baseId: 'asc' }, { position: 'asc' }],
    select: { id: true, name: true, baseId: true, base: { select: { name: true } } },
  });
  return NextResponse.json(
    tables.map((t) => ({ id: t.id, name: t.name, baseId: t.baseId, baseName: t.base.name })),
  );
});
