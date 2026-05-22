import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const FIELDS = [
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE',
  'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_FROM_NAME',
];

// GET /api/settings/email — current SMTP config (password never returned)
export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await (prisma as any).systemConfig.findMany({ where: { key: { in: FIELDS } } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value || '';

  return NextResponse.json({
    host: map.SMTP_HOST || '',
    port: map.SMTP_PORT || '587',
    secure: map.SMTP_SECURE === 'true',
    user: map.SMTP_USER || '',
    passSet: !!(map.SMTP_PASS && map.SMTP_PASS.length > 0),
    from: map.SMTP_FROM || '',
    fromName: map.SMTP_FROM_NAME || '',
  });
}

// PATCH /api/settings/email — save SMTP config (password only updated if provided)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const updates: Record<string, string> = {};

  if (typeof body.host === 'string') updates.SMTP_HOST = body.host.trim();
  if (body.port !== undefined) updates.SMTP_PORT = String(parseInt(String(body.port), 10) || 587);
  if (body.secure !== undefined) updates.SMTP_SECURE = body.secure ? 'true' : 'false';
  if (typeof body.user === 'string') updates.SMTP_USER = body.user.trim();
  if (typeof body.from === 'string') updates.SMTP_FROM = body.from.trim();
  if (typeof body.fromName === 'string') updates.SMTP_FROM_NAME = body.fromName.trim();
  // Only overwrite the password when a non-empty new value is provided.
  if (typeof body.pass === 'string' && body.pass.length > 0) updates.SMTP_PASS = body.pass;

  for (const [key, value] of Object.entries(updates)) {
    await (prisma as any).systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  return NextResponse.json({ success: true, updated: Object.keys(updates) });
}
