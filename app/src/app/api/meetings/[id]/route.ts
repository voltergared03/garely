import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/meetings/:id — get single meeting with full details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

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
      reports: {
        orderBy: { generatedAt: 'desc' },
        take: 1,
        include: {
          tasks: {
            include: {
              assignee: { select: { id: true, name: true, image: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
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

  return NextResponse.json(meeting);
}

// PATCH /api/meetings/:id — update meeting
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

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

  return NextResponse.json(updated);
}

// DELETE /api/meetings/:id — delete meeting
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const userId = (session.user as any).id;
  const userRole = (session.user as any).role;

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

  await prisma.meeting.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
