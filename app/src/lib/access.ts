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
  // Tasks are base-engine Rows (Phase 3); structural FKs live in the TaskRow sidecar.
  const t = await prisma.taskRow.findUnique({
    where: { rowId: taskId },
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

type RowTaskMeta = { meetingId: string | null; departmentId: string | null; parentRowId: string | null };

/**
 * Does `userId` get a non-meeting grant on the task Row `rowId` with the given
 * sidecar `meta`? Paths (mirror the legacy MeetingTask gating, now over Row*):
 *   P1 the user is one of the row's assignees (RowAssignment — lead OR co-assignee,
 *      collapses legacy assigneeId + assignees);
 *   P2 the user is a collaborator (RowCollaborator);
 *   P3 the row's department is one of the user's departments;
 *   P5 the row has an assignee who belongs to one of the user's departments (team lens).
 * Meeting-tied access (P6) is handled by the caller. `deptUserIds` = the set of
 * users in `myDeptIds`, precomputed once by the caller for the team lens.
 */
async function rowTaskGrants(
  rowId: string,
  meta: RowTaskMeta,
  userId: string,
  myDeptIds: string[],
  deptUserIds: string[],
): Promise<boolean> {
  if (await prisma.rowAssignment.count({ where: { rowId, userId } })) return true; // P1
  if (await prisma.rowCollaborator.count({ where: { rowId, userId } })) return true; // P2
  if (meta.departmentId && myDeptIds.includes(meta.departmentId)) return true; // P3
  if (deptUserIds.length && (await prisma.rowAssignment.count({ where: { rowId, userId: { in: deptUserIds } } }))) {
    return true; // P5 team lens
  }
  return false;
}

/**
 * May this user VIEW a task (now a base-engine Row) and its collaboration
 * sub-resources? Admins see all; otherwise grant if any rowTaskGrants path holds
 * for the task or its parent, or — for meeting-tied tasks — they can access the
 * meeting. Subtasks inherit their parent's visibility (via TaskRow.parentRowId).
 * Signature unchanged so the task routes that import it need no edit.
 */
export async function userCanViewTask(
  taskId: string,
  userId: string | null | undefined,
  role?: string | null,
): Promise<boolean> {
  if (!taskId || !userId) return false;
  if (role === 'admin') return true;

  const meta = await prisma.taskRow.findUnique({
    where: { rowId: taskId },
    select: { meetingId: true, departmentId: true, parentRowId: true },
  });
  if (!meta) return false;

  const myDeptIds = await userDepartmentIds(userId);
  const deptUserIds = myDeptIds.length
    ? [
        ...new Set(
          (
            await prisma.departmentMember.findMany({
              where: { departmentId: { in: myDeptIds } },
              select: { userId: true },
            })
          ).map((m) => m.userId),
        ),
      ]
    : [];

  if (await rowTaskGrants(taskId, meta, userId, myDeptIds, deptUserIds)) return true;

  let parentMeta: RowTaskMeta | null = null;
  if (meta.parentRowId) {
    parentMeta = await prisma.taskRow.findUnique({
      where: { rowId: meta.parentRowId },
      select: { meetingId: true, departmentId: true, parentRowId: true },
    });
    if (parentMeta && (await rowTaskGrants(meta.parentRowId, parentMeta, userId, myDeptIds, deptUserIds))) {
      return true;
    }
  }

  const meetingId = meta.meetingId ?? parentMeta?.meetingId ?? null;
  if (meetingId && (await userCanAccessMeeting(meetingId, userId, role))) return true;

  return false;
}
