import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateMeetingSlug } from '@/lib/utils';
import { readConfig, num } from '@/lib/config';
import { isInternalAuthed } from '@/lib/internal-auth';

// GET /api/meetings — list meetings
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Internal agent lookup by livekitRoom — requires the shared internal secret.
  const livekitRoom = searchParams.get('livekitRoom');
  if (livekitRoom) {
    if (!isInternalAuthed(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const meetings = await prisma.meeting.findMany({
      where: { livekitRoom },
      select: { id: true, livekitRoom: true, status: true, title: true },
      take: 1,
    });
    return NextResponse.json(meetings);
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const userRole = session.user.role;

  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const where: any = {};
  if (status) where.status = status;
  if (from || to) {
    where.scheduledAt = {};
    if (from) where.scheduledAt.gte = new Date(from);
    if (to) where.scheduledAt.lte = new Date(to);
  }

  // Regular members can only see meetings they created or participate in
  if (userRole !== 'admin') {
    where.OR = [
      { createdById: userId },
      { participants: { some: { userId: userId } } },
    ];
  }

  const meetings = await prisma.meeting.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true, email: true, image: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
      reports: { select: { id: true }, take: 1 },
      _count: { select: { transcripts: true, tasks: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  return NextResponse.json(meetings);
}

// POST /api/meetings — create meeting
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const t = await getTranslations('errors');
  try {
    const body = await req.json();
    const {
      title,
      description,
      scheduledAt,
      durationMin = 60,
      recurrence,
      participants = [],
      transcriptionEnabled,
      aiReportEnabled,
      allowGuests,
      agenda = null,
    } = body;

    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    if (!cleanTitle) {
      return NextResponse.json({ error: t('titleRequired') }, { status: 400 });
    }

    // Apply workspace policy defaults when the client doesn't explicitly set them
    const wsCfg = await readConfig(['WS_LIVE_TRANSCRIPTION', 'WS_AI_SUMMARY', 'WS_GUEST_ACCESS', 'WS_MAX_DURATION_MIN']);
    const effTranscription = transcriptionEnabled ?? (wsCfg.WS_LIVE_TRANSCRIPTION !== 'false');
    const effAiReport = aiReportEnabled ?? (wsCfg.WS_AI_SUMMARY !== 'false');
    const effAllowGuests = allowGuests ?? (wsCfg.WS_GUEST_ACCESS !== 'false');
    const maxDur = num(wsCfg, 'WS_MAX_DURATION_MIN') || 240;
    const dur = Math.min(Math.max(parseInt(String(durationMin), 10) || 60, 5), maxDur);
    const safeParticipants = Array.isArray(participants) ? participants : [];

    const roomSlug = generateMeetingSlug();
    const joinToken = generateMeetingSlug();

    const meeting = await prisma.meeting.create({
      data: {
        title: cleanTitle,
        description: description || null,
        createdById: session.user.id,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        durationMin: dur,
        recurrence: recurrence || null,
        livekitRoom: `meet-${roomSlug}`,
        joinToken,
        transcriptionEnabled: effTranscription,
        aiReportEnabled: effAiReport,
        allowGuests: effAllowGuests,
        agenda,
        participants: {
          create: [
            // Creator as host
            { userId: session.user.id, role: 'host', rsvpStatus: 'accepted' },
            // Other participants
            ...safeParticipants.map((p: { userId?: string; guestEmail?: string; guestName?: string }) => ({
              userId: p.userId || null,
              guestEmail: p.guestEmail || null,
              guestName: p.guestName || null,
              role: 'participant',
            })),
          ],
        },
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, image: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    });

    return NextResponse.json(meeting, { status: 201 });
  } catch (e) {
    console.error('create meeting error:', e);
    return NextResponse.json({ error: t('createMeetingFailed') }, { status: 500 });
  }
}
