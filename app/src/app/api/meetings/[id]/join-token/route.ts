import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createLivekitToken, createRoom } from '@/lib/livekit';
import { generateMeetingSlug } from '@/lib/utils';
import { readConfig } from '@/lib/config';

// POST /api/meetings/:id/join-token — get LiveKit JWT to join meeting
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const body = await req.json().catch(() => ({}));
    const t = await getTranslations('errors');

    let meeting: any;

    if (id === 'quick') {
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const roomName = `quick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const joinSlug = generateMeetingSlug();
      meeting = await prisma.meeting.create({
        data: {
          title: t('quickMeetingTitle'),
          createdById: (session.user as any).id,
          livekitRoom: roomName,
          joinToken: joinSlug,
          status: 'active',
          scheduledAt: new Date(),
          durationMin: 60,
        },
      });
    } else {
      meeting = await prisma.meeting.findUnique({
        where: { id },
        select: { id: true, livekitRoom: true, joinToken: true, status: true, allowGuests: true, createdById: true },
      });
    }

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    if (meeting.status === 'scheduled') {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { status: 'active' },
      }).catch(() => {});
    }

    if (!meeting.livekitRoom) {
      const roomName = `meet-${meeting.id.slice(0, 8)}-${Date.now()}`;
      meeting = await prisma.meeting.update({
        where: { id: meeting.id },
        data: { livekitRoom: roomName, status: 'active' },
      });
    }

    let participantName: string;
    let participantId: string;
    let isHost = false;
    let isAdmin = false;

    if (session?.user) {
      participantName = session.user.name || 'User';
      participantId = (session.user as any).id;
      isHost = meeting.createdById === participantId || id === 'quick';
      isAdmin = (session.user as any).role === 'admin';
    } else if (body.guestName) {
      if (meeting.allowGuests === false) {
        return NextResponse.json({ error: 'This meeting does not allow guests' }, { status: 403 });
      }
      // Waiting room: guests must be approved by a participant before joining
      const reqId = body.requestId as string | undefined;
      if (reqId) {
        const jr = await (prisma as any).joinRequest.findUnique({ where: { id: reqId } });
        if (!jr || jr.meetingId !== meeting.id) {
          return NextResponse.json({ error: t('joinRequestNotFound') }, { status: 404 });
        }
        if (jr.status === 'denied') {
          return NextResponse.json({ denied: true }, { status: 403 });
        }
        if (jr.status !== 'approved') {
          return NextResponse.json({ pending: true, requestId: jr.id }, { status: 202 });
        }
        participantName = jr.guestName;
        participantId = `guest-${jr.id.slice(0, 8)}`;
      } else {
        const jr = await (prisma as any).joinRequest.create({
          data: { meetingId: meeting.id, guestName: body.guestName, status: 'pending' },
        });
        return NextResponse.json({ pending: true, requestId: jr.id }, { status: 202 });
      }
    } else {
      return NextResponse.json({ error: 'Unauthorized — please provide a guest name or sign in' }, { status: 401 });
    }

    // Ensure LiveKit room exists (lazy creation) with workspace participant limit
    const wsLimit = await readConfig(['WS_MAX_PARTICIPANTS']);
    const maxP = parseInt(wsLimit.WS_MAX_PARTICIPANTS || '20', 10) || 20;
    await createRoom(meeting.livekitRoom, maxP);

    const token = await createLivekitToken(
      meeting.livekitRoom,
      participantName,
      participantId,
      isHost || isAdmin
    );

    const wsUrl = process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || 'ws://localhost:7880';

    return NextResponse.json({
      token,
      wsUrl,
      roomName: meeting.livekitRoom,
      meetingId: meeting.id,
      joinToken: meeting.joinToken || null,
      isHost,
      isAdmin,
      canKick: isHost || isAdmin,
    });
  } catch (error: any) {
    console.error('Join token error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
