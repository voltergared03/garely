import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { promises as fs } from 'fs';
import { userCanAccessMeeting } from '@/lib/access';

const RETENTION_DAYS = 7;

function serialize(rec: any) {
  return {
    id: rec.id,
    fileName: rec.fileName,
    fileSize: rec.fileSize != null ? Number(rec.fileSize) : null,
    durationSec: rec.durationSec ?? null,
    status: rec.status,
    permanent: rec.permanent,
    expiresAt: rec.expiresAt ? rec.expiresAt.toISOString() : null,
    createdAt: rec.createdAt.toISOString(),
    url: `/api/recordings/${rec.id}/file`,
  };
}

// GET — latest ready recording for the meeting (or null)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!(await userCanAccessMeeting(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const rec = await prisma.recording.findFirst({
    where: { meetingId: id, status: 'ready' },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ recording: rec ? serialize(rec) : null });
}

// PATCH — { permanent: boolean } → keep forever (no expiry) or reset 7-day expiry
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!(await userCanAccessMeeting(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({} as any));
  const permanent = !!body.permanent;

  const t = await getTranslations('errors');
  const rec = await prisma.recording.findFirst({ where: { meetingId: id }, orderBy: { createdAt: 'desc' } });
  if (!rec) return NextResponse.json({ error: t('recordingNotFound') }, { status: 404 });

  const expiresAt = permanent ? null : new Date(Date.now() + RETENTION_DAYS * 86400000);
  const updated = await prisma.recording.update({
    where: { id: rec.id },
    data: { permanent, expiresAt },
  });
  return NextResponse.json({ recording: serialize(updated) });
}

// DELETE — remove the recording file + row (admin or any authenticated user)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!(await userCanAccessMeeting(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const t = await getTranslations('errors');
  const rec = await prisma.recording.findFirst({ where: { meetingId: id }, orderBy: { createdAt: 'desc' } });
  if (!rec) return NextResponse.json({ error: t('recordingNotFound') }, { status: 404 });

  if (rec.filePath) await fs.unlink(rec.filePath).catch(() => {});
  await prisma.recording.delete({ where: { id: rec.id } });
  return NextResponse.json({ success: true });
}
