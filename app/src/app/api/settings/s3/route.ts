import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readConfig, writeConfig } from '@/lib/config';
import { withRoute } from '@/lib/with-route';

const FIELDS = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_FORCE_PATH_STYLE'];

// GET /api/settings/s3 — current S3 config (secret never returned)
async function getHandler() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const m = await readConfig(FIELDS);
  return NextResponse.json({
    endpoint: m.S3_ENDPOINT || '',
    region: m.S3_REGION || '',
    bucket: m.S3_BUCKET || '',
    accessKeyId: m.S3_ACCESS_KEY || '',
    secretSet: !!(m.S3_SECRET_KEY && m.S3_SECRET_KEY.length > 0),
    forcePathStyle: m.S3_FORCE_PATH_STYLE === 'true',
  });
}

// PATCH /api/settings/s3 — save S3 config (secret only updated if provided)
async function patchHandler(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as any));
  const updates: Record<string, string> = {};
  if (typeof body.endpoint === 'string') updates.S3_ENDPOINT = body.endpoint.trim();
  if (typeof body.region === 'string') updates.S3_REGION = body.region.trim();
  if (typeof body.bucket === 'string') updates.S3_BUCKET = body.bucket.trim();
  if (typeof body.accessKeyId === 'string') updates.S3_ACCESS_KEY = body.accessKeyId.trim();
  if (body.forcePathStyle !== undefined) updates.S3_FORCE_PATH_STYLE = body.forcePathStyle ? 'true' : 'false';
  if (typeof body.secretAccessKey === 'string' && body.secretAccessKey.length > 0) updates.S3_SECRET_KEY = body.secretAccessKey;

  await writeConfig(updates);
  return NextResponse.json({ success: true, updated: Object.keys(updates) });
}

export const GET = withRoute('settings.s3.get', getHandler);
export const PATCH = withRoute('settings.s3.update', patchHandler);
