import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, promises as fs } from 'fs';
import { Readable } from 'stream';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { rowForOrg, basePermission, atLeast } from '@/lib/base-engine';
import { resolveRowFile, deleteRowFile, downloadContentType } from '@/lib/task-files';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

// GET — download the file. ALWAYS served as an attachment (never inline) with
// nosniff, so a malicious upload can't execute as HTML/script in our origin.
export const GET = withRoute('rowAttachments.download', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id, attachmentId } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);

  const att = await prisma.rowAttachment.findUnique({ where: { id: attachmentId } });
  if (!att || att.rowId !== id) return jsonError('not_found', 404);

  const abs = resolveRowFile(att.filePath);
  if (!abs) return jsonError('not_found', 404);
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return jsonError('file_missing', 404);
  }

  const safeName = (att.fileName || 'file').replace(/["\\\r\n]/g, '_');
  const stream = createReadStream(abs);
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: {
      'Content-Type': downloadContentType(att.mimeType),
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

// DELETE — uploader or base-admin (incl. workspace admin) only.
export const DELETE = withRoute('rowAttachments.delete', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id, attachmentId } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);

  const att = await prisma.rowAttachment.findUnique({
    where: { id: attachmentId },
    select: { rowId: true, uploadedById: true, filePath: true },
  });
  if (!att || att.rowId !== id) return jsonError('not_found', 404);

  const perm = await basePermission(row.table.base, r.orgId, r.session);
  const isAdmin = atLeast(perm.level, 'admin'); // workspace admins already resolve to 'admin'
  if (!isAdmin && att.uploadedById !== r.session.user.id) return jsonError('forbidden', 403);

  await prisma.rowAttachment.delete({ where: { id: attachmentId } });
  await deleteRowFile(att.filePath);
  return NextResponse.json({ ok: true });
});
