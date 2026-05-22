import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { roomService } from '@/lib/livekit';

// POST /api/meetings/:id/kick — remove a participant from LiveKit room
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { participantIdentity } = await req.json();

    if (!participantIdentity) {
      return NextResponse.json({ error: 'participantIdentity is required' }, { status: 400 });
    }

    const userId = (session.user as any).id;
    const userRole = (session.user as any).role;

    // Get meeting
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { id: true, livekitRoom: true, createdById: true },
    });

    if (!meeting || !meeting.livekitRoom) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Only admin or meeting creator can kick
    const isAdmin = userRole === 'admin';
    const isCreator = meeting.createdById === userId;

    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: 'Only admin or meeting host can remove participants' }, { status: 403 });
    }

    // Cannot kick yourself
    if (participantIdentity === userId) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
    }

    // Remove participant from LiveKit room
    await roomService.removeParticipant(meeting.livekitRoom, participantIdentity);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Kick participant error:', error);
    // LiveKit might throw if participant already left
    if (error?.message?.includes('not found') || error?.message?.includes('participant')) {
      return NextResponse.json({ error: 'Participant not found in room' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to remove participant' }, { status: 500 });
  }
}
