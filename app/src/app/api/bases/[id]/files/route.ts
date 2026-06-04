import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { requireOrg } from '@/lib/api-auth';
import { withRoute } from '@/lib/with-route';
import { jsonError } from '@/lib/http';
import { baseForOrg, gate } from '@/lib/base-engine';
import { saveBaseFile, deleteBaseFile, MAX_FILE_SIZE } from '@/lib/base-files';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/bases/[id]/files — upload one file (multipart, field "file"), editor+.
// Saves bytes only; the client appends the returned descriptor to the cell and
// persists it via the row PATCH (which re-validates + strips hidden fields).
export const POST = withRoute('bases.files.upload', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  const denied = await gate(base, r.orgId, r.session, 'editor');
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) return jsonError('no_file', 400);
  if (file.size > MAX_FILE_SIZE) return jsonError('file_too_large', 413);

  const { filePath, fileSize } = await saveBaseFile(id, file);
  return NextResponse.json(
    { id: randomUUID(), name: (file.name || 'file').slice(0, 255), path: filePath, mime: file.type || null, size: fileSize },
    { status: 201 },
  );
});

// DELETE /api/bases/[id]/files?path=<relpath> — delete the bytes of a file in
// this base (editor+). The cell entry is removed by the client via the row PATCH;
// this just reclaims disk. Refuses paths outside the base's own folder.
export const DELETE = withRoute('bases.files.delete', async (req: NextRequest, ctx: Ctx) => {
  const r = await requireOrg();
  if (r instanceof Response) return r;
  const { id } = await ctx.params;
  const base = await baseForOrg(id, r.orgId, r.session);
  if (!base) return jsonError('not_found', 404);
  const denied = await gate(base, r.orgId, r.session, 'editor');
  if (denied) return denied;

  const path = new URL(req.url).searchParams.get('path') || '';
  if (!path.startsWith(`${id}/`)) return jsonError('bad_request', 400);
  await deleteBaseFile(path);
  return NextResponse.json({ ok: true });
});
