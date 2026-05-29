import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { promises as fs } from 'fs';
import { userCanAccessMeeting } from '@/lib/access';
import { withRoute } from '@/lib/with-route';

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

// PATCH/DELETE are destructive (keep-forever defeats retention; delete removes
// the file for everyone), so they require an admin or the meeting creator — not
// every participant. GET/stream stays at participant level.
async function requireMeetingOwner(
  meetingId: string,
  userId: string,
  role: string | null | undefined,
): Promise<Response | null> {
  if (role === 'admin') return null;
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { createdById: true },
  });
  if (!m || m.createdById !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// GET — latest ready recording for the meeting (or null)
async function getHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
async function patchHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const forbidden = await requireMeetingOwner(id, session.user.id, session.user.role);
  if (forbidden) return forbidden;
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

// DELETE — remove the recording file + row (admin or meeting creator only)
async function deleteHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const forbidden = await requireMeetingOwner(id, session.user.id, session.user.role);
  if (forbidden) return forbidden;

  const t = await getTranslations('errors');
  const rec = await prisma.recording.findFirst({ where: { meetingId: id }, orderBy: { createdAt: 'desc' } });
  if (!rec) return NextResponse.json({ error: t('recordingNotFound') }, { status: 404 });

  if (rec.filePath) await fs.unlink(rec.filePath).catch(() => {});
  await prisma.recording.delete({ where: { id: rec.id } });
  return NextResponse.json({ success: true });
}

export const GET = withRoute('meetings.recording.get', getHandler);
export const PATCH = withRoute('meetings.recording.update', patchHandler);
export const DELETE = withRoute('meetings.recording.delete', deleteHandler);
