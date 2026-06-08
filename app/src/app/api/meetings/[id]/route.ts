import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendMeetingInvite } from '@/lib/meeting-invite';
import { listTasks } from '@/lib/tasks';
import { withRoute } from '@/lib/with-route';

// GET /api/meetings/:id — get single meeting with full details
async function getHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;
  const userRole = session.user.role;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true, image: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
      transcripts: {
        orderBy: { startTime: 'asc' },
        include: {
          speaker: { select: { id: true, name: true, image: true } },
        },
      },
      // Report action items are NOT loaded here from the dormant MeetingTask
      // relation — they live in the base-engine task Rows now (Phase 3) and are
      // attached below via listTasks() in the shape the report transform expects.
      reports: {
        orderBy: { generatedAt: 'desc' },
        take: 1,
      },
      tasks: {
        include: {
          assignee: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  // Non-admin users can only view meetings they created or participate in
  if (userRole !== 'admin') {
    const isCreator = meeting.createdById === userId;
    const isParticipant = meeting.participants.some(
      (p: any) => p.userId === userId
    );
    if (!isCreator && !isParticipant) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }
  }

  // Attach the report's action items from the base-engine task Rows (Phase 3),
  // shaped like the old MeetingTask relation so the report transform maps them to
  // actionItems unchanged. The viewer is already access-gated above; scope 'all'
  // returns every action item of this meeting (not just the viewer's own).
  const rep = (meeting as { reports?: { tasks?: unknown }[] }).reports?.[0];
  if (rep) {
    rep.tasks = await listTasks(session, { scope: 'all', meetingId: id, includeSubtasks: false });
  }

  return NextResponse.json(meeting);
}

// PATCH /api/meetings/:id — update meeting
async function patchHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;
  const userRole = session.user.role;

  const existing = await prisma.meeting.findUnique({
    where: { id },
    include: { participants: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isAdmin = userRole === 'admin';
  const isCreator = existing.createdById === userId;
  if (!isAdmin && !isCreator) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { participants, ...meetingData } = body;

  // Validate status against the allowed set
  const VALID_STATUS = ['scheduled', 'live', 'ended', 'cancelled'];
  if ('status' in meetingData && !VALID_STATUS.includes(meetingData.status)) {
    const t = await getTranslations('errors');
    return NextResponse.json({ error: t('invalidStatus') }, { status: 400 });
  }

  // Update meeting fields
  const allowedFields: Record<string, any> = {};
  const editable = ['title', 'description', 'scheduledAt', 'durationMin', 'recurrence',
    'transcriptionEnabled', 'aiReportEnabled', 'allowGuests', 'status', 'agenda'];
  for (const key of editable) {
    if (key in meetingData) {
      if (key === 'scheduledAt' && meetingData[key]) {
        allowedFields[key] = new Date(meetingData[key]);
      } else {
        allowedFields[key] = meetingData[key];
      }
    }
  }

  const meeting = await prisma.meeting.update({
    where: { id },
    data: allowedFields,
  });

  // Update participants if provided
  if (Array.isArray(participants)) {
    // Get current non-host participants
    const currentNonHost = existing.participants.filter((p: any) => p.role !== 'host');
    const currentHostIds = existing.participants.filter((p: any) => p.role === 'host').map((p: any) => p.userId);

    // New participant user IDs (excluding host)
    const newParticipantIds = participants
      .map((p: any) => p.userId)
      .filter((uid: string) => uid && !currentHostIds.includes(uid));

    // Remove participants that are no longer in the list
    const toRemove = currentNonHost.filter(
      (p: any) => p.userId && !newParticipantIds.includes(p.userId)
    );
    if (toRemove.length > 0) {
      await prisma.meetingParticipant.deleteMany({
        where: { id: { in: toRemove.map((p: any) => p.id) } },
      });
    }

    // Add new participants
    const existingUserIds = currentNonHost.map((p: any) => p.userId).filter(Boolean);
    const toAdd = newParticipantIds.filter((uid: string) => !existingUserIds.includes(uid));
    if (toAdd.length > 0) {
      await prisma.meetingParticipant.createMany({
        data: toAdd.map((uid: string) => ({
          meetingId: id,
          userId: uid,
          role: 'participant',
        })),
      });
    }
  }

  // Return updated meeting with participants
  const updated = await prisma.meeting.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true, image: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  // Calendar invite: newly scheduled → invite; otherwise an update on a real change.
  const wasScheduled = !!existing.scheduledAt;
  const nowScheduled = !!updated?.scheduledAt;
  if (nowScheduled && !wasScheduled) {
    void sendMeetingInvite(id, 'invite');
  } else if (nowScheduled && updated) {
    const timeChanged = +new Date(existing.scheduledAt as Date) !== +new Date(updated.scheduledAt as Date);
    const changed = timeChanged
      || existing.durationMin !== updated.durationMin
      || existing.title !== updated.title
      || updated.participants.length > existing.participants.length;
    if (changed) void sendMeetingInvite(id, 'update');
  }

  return NextResponse.json(updated);
}

// DELETE /api/meetings/:id — delete meeting
async function deleteHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id;
  const userRole = session.user.role;

  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isAdmin = userRole === 'admin';
  const isCreator = meeting.createdById === userId;
  if (!isAdmin && !isCreator) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Don't allow deleting live meetings
  if (meeting.status === 'live') {
    return NextResponse.json({ error: 'Cannot delete a live meeting' }, { status: 400 });
  }

  // Tell attendees it's cancelled before the participant rows cascade away.
  await sendMeetingInvite(id, 'cancel').catch(() => {});
  await prisma.meeting.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

export const GET = withRoute('meetings.get', getHandler);
export const PATCH = withRoute('meetings.update', patchHandler);
export const DELETE = withRoute('meetings.delete', deleteHandler);
