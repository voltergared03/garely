import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { baseForOrg, basePermission } from '@/lib/base-engine';
import { readBaseFile, canInline, serveContentType } from '@/lib/base-files';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; fileId: string }> };

// GET /api/bases/[id]/files/[fileId]?row=<rowId>&field=<fieldId>
// Serves an attachment. Read access (viewer+) on the base is required; the field
// must not be hidden for the caller; and the file must actually be referenced by
// that row's cell (the stored descriptor — never a client-supplied path). Images
// and PDFs are served inline (preview); everything else as an attachment.
export const GET = withRoute('bases.files.serve', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id, fileId } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  const perm = await basePermission(base, r.orgId, r.session);

  const url = new URL(req.url);
  const rowId = url.searchParams.get('row') || '';
  const fieldId = url.searchParams.get('field') || '';
  if (!rowId || !fieldId) return jsonError('bad_request', 400);
  if (perm.hiddenFields.includes(fieldId)) return jsonError('forbidden', 403);

  const row = await prisma.row.findFirst({ where: { id: rowId, table: { baseId: id } }, select: { data: true } });
  if (!row) return jsonError('not_found', 404);
  const cell = (row.data as Record<string, unknown>)?.[fieldId];
  const desc = Array.isArray(cell)
    ? (cell.find((f) => f && typeof f === 'object' && (f as { id?: string }).id === fileId) as
        | { path?: unknown; mime?: unknown; name?: unknown }
        | undefined)
    : undefined;
  if (!desc || typeof desc.path !== 'string' || !desc.path.startsWith(`${id}/`)) return jsonError('not_found', 404);

  const buf = await readBaseFile(desc.path);
  if (!buf) return jsonError('not_found', 404);
  const mime = typeof desc.mime === 'string' ? desc.mime : null;
  const name = typeof desc.name === 'string' ? desc.name : 'file';
  const disposition = canInline(mime) ? 'inline' : 'attachment';
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': serveContentType(mime),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
    },
  });
});
