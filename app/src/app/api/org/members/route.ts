import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';

// GET /api/org/members — the current org's members (for person pickers, etc.).
// Org-scoped (NOT admin-gated): any member can see who else is in the org.
export const GET = withRoute('org.members', async () => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const memberships = await prisma.membership.findMany({
    where: { orgId: r.orgId },
    select: { user: { select: { id: true, name: true, image: true, email: true } } },
    orderBy: { user: { name: 'asc' } },
  });
  return NextResponse.json(memberships.map((m) => m.user));
});
