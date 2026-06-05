import { NextResponse, type NextRequest } from 'next/server';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { rowForOrg, basePermission } from '@/lib/base-engine';
import { totpCellView } from '@/lib/base-totp';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; fieldId: string }> };

// GET /api/rows/[id]/totp/[fieldId] — current TOTP code + seconds remaining for
// one cell. Viewer+ on the base; the field must not be hidden for the caller.
// The secret is never returned (totpCellView strips it to {code, remainingSec}).
export const GET = withRoute('rows.totp', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id, fieldId } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);
  const perm = await basePermission(row.table.base, r.orgId, r.session);
  if (perm.hiddenFields.includes(fieldId)) return jsonError('forbidden', 403);
  const cell = (row.data as Record<string, unknown> | null)?.[fieldId];
  return NextResponse.json(totpCellView(cell));
});
