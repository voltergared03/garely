import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { rowForOrg, basePermission, atLeast } from '@/lib/base-engine';
import { saveRowFile, MAX_FILE_SIZE } from '@/lib/task-files';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

type AttachmentRow = {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  fileSize: bigint | null;
  uploadedById: string | null;
  createdAt: Date;
};

async function shape(atts: AttachmentRow[]) {
  // uploadedById is a soft String? (no User relation), so resolve names in one batch.
  const ids = [...new Set(atts.map((a) => a.uploadedById).filter((x): x is string => !!x))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return atts.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    filePath: a.filePath,
    mimeType: a.mimeType,
    fileSize: a.fileSize == null ? null : Number(a.fileSize),
    uploadedBy: a.uploadedById ? { id: a.uploadedById, name: nameById.get(a.uploadedById) ?? null } : null,
    createdAt: a.createdAt,
  }));
}

// GET /api/rows/[id]/attachments — list (any base access).
export const GET = withRoute('rowAttachments.list', async (_req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);

  const atts = await prisma.rowAttachment.findMany({ where: { rowId: id }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(await shape(atts));
});

// POST /api/rows/[id]/attachments — upload (multipart/form-data, field "file"; editor+).
export const POST = withRoute('rowAttachments.upload', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const row = await rowForOrg(id, r.orgId, r.session);
  if (!row) return jsonError('not_found', 404);
  const perm = await basePermission(row.table.base, r.orgId, r.session);
  if (!atLeast(perm.level, 'editor')) return jsonError('forbidden', 403);

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) return jsonError('no_file', 400);
  if (file.size > MAX_FILE_SIZE) return jsonError('file_too_large', 413);

  const { filePath, fileSize } = await saveRowFile(id, file);
  const att = await prisma.rowAttachment.create({
    data: {
      rowId: id,
      fileName: file.name || 'file',
      filePath,
      mimeType: file.type || null,
      fileSize: BigInt(fileSize),
      uploadedById: r.session.user.id,
    },
  });
  const [shaped] = await shape([att]);
  return NextResponse.json(shaped, { status: 201 });
});
