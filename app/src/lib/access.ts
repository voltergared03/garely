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

/** Department IDs a user belongs to (member or lead). Empty when none. */
export async function userDepartmentIds(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  const rows = await prisma.departmentMember.findMany({
    where: { userId },
    select: { departmentId: true },
  });
  return rows.map((r) => r.departmentId);
}

/** Department IDs where the user is a lead (manager). */
export async function userLeadDepartmentIds(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  const rows = await prisma.departmentMember.findMany({
    where: { userId, isLead: true },
    select: { departmentId: true },
  });
  return rows.map((r) => r.departmentId);
}

type TaskAccessFields = {
  assigneeId: string | null;
  meetingId: string | null;
  departmentId: string | null;
  collaborators: { id: string }[];
  assignee: { departmentMemberships: { departmentId: string }[] } | null;
};

const taskAccessSelect = {
  assigneeId: true,
  meetingId: true,
  departmentId: true,
  collaborators: { select: { id: true } },
  assignee: { select: { departmentMemberships: { select: { departmentId: true } } } },
} as const;

/**
 * May this user VIEW a task and its collaboration sub-resources (subtasks,
 * comments, attachments, collaborators)? Mirrors the gating in GET /api/tasks:
 * admins see all; otherwise a user sees a task if they are its assignee, a
 * collaborator, it belongs to one of their departments, its assignee shares a
 * department with them (team lens), or — for meeting-tied tasks — they can
 * access the meeting. Subtasks inherit their parent's visibility.
 */
export async function userCanViewTask(
  taskId: string,
  userId: string | null | undefined,
  role?: string | null,
): Promise<boolean> {
  if (!taskId || !userId) return false;
  if (role === 'admin') return true;

  const task = await prisma.meetingTask.findUnique({
    where: { id: taskId },
    select: {
      ...taskAccessSelect,
      collaborators: { where: { userId }, select: { id: true } },
      parent: {
        select: {
          ...taskAccessSelect,
          collaborators: { where: { userId }, select: { id: true } },
        },
      },
    },
  });
  if (!task) return false;

  const myDeptIds = await userDepartmentIds(userId);
  const grants = (t: TaskAccessFields): boolean => {
    if (t.assigneeId === userId) return true;
    if (t.collaborators.length > 0) return true;
    if (t.departmentId && myDeptIds.includes(t.departmentId)) return true;
    if (t.assignee?.departmentMemberships.some((dm) => myDeptIds.includes(dm.departmentId))) return true;
    return false;
  };

  if (grants(task)) return true;
  if (task.parent && grants(task.parent)) return true;

  const meetingId = task.meetingId ?? task.parent?.meetingId ?? null;
  if (meetingId && (await userCanAccessMeeting(meetingId, userId, role))) return true;

  return false;
}
