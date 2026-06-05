import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { rowForOrg, basePermission } from '@/lib/base-engine';
import { decryptPasswordCell } from '@/lib/base-password';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; fieldId: string }> };

// GET /api/rows/[id]/password/[fieldId] — reveal ONE password cell's plaintext.
// Viewer+ on the base; the field must not be hidden for the caller AND must
// actually be a `password` field on this row's base (so this endpoint can't be
// used to decrypt a totp seed). The plaintext is returned ONLY here (never in
// bulk row reads) and only on an explicit reveal/copy.
export const GET = withRoute('rows.password', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id, fieldId } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);

  const field = await prisma.field.findUnique({
    where: { id: fieldId },
    select: { type: true, table: { select: { baseId: true } } },
  });
  if (!field || field.type !== 'password' || field.table.baseId !== row.table.base.id) {
    return jsonError('not_found', 404);
  }

  const perm = await basePermission(row.table.base, r.orgId, r.session);
  if (perm.hiddenFields.includes(fieldId)) return jsonError('forbidden', 403);

  const cell = (row.data as Record<string, unknown> | null)?.[fieldId];
  return NextResponse.json({ password: decryptPasswordCell(cell) ?? '' });
});
