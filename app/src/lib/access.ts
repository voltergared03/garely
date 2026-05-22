import { prisma } from './prisma';

/**
 * Authorization helper: may this user read/act on this meeting?
 * Admins always can; otherwise the user must be the creator or a participant.
 */
export async function userCanAccessMeeting(
  meetingId: string,
  userId: string | null | undefined,
  role?: string | null,
): Promise<boolean> {
  if (!meetingId || !userId) return false;
  if (role === 'admin') return true;
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      createdById: true,
      participants: { where: { userId }, select: { id: true } },
    },
  });
  if (!m) return false;
  return m.createdById === userId || m.participants.length > 0;
}

/** Resolve the meetingId a task belongs to (for task-level authorization). */
export async function meetingIdOfTask(taskId: string): Promise<string | null> {
  if (!taskId) return null;
  const t = await prisma.meetingTask.findUnique({
    where: { id: taskId },
    select: { meetingId: true },
  });
  return t?.meetingId ?? null;
}
