/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface Participant {
  user: { id: string; name: string | null; image: string | null } | null;
  guestName: string | null;
}

export interface Meeting {
  id: string;
  title: string;
  scheduledAt: string | null;
  durationMin: number;
  status: string;
  description?: string | null;
  recurrence?: any;
  createdBy: { id: string; name: string | null; image: string | null };
  participants: Participant[];
  reports?: { id: string }[];
  agenda?: string[] | null;
  joinToken?: string | null;
  _count?: { transcripts: number; tasks: number };
}

// A task with a deadline, shown on the calendar on its due date.
export interface CalTask {
  id: string;
  title: string;
  dueDate: string;
  status: string; // open | in_progress | done
  priority: string; // high | medium | low
  meetingId: string | null;
  meeting?: { id: string; title: string } | null;
  assignee?: { id: string; name: string | null; image: string | null } | null;
  assigneeId?: string | null;
  parentId?: string | null;
  departmentId?: string | null;
  department?: { id: string; name: string; color: string | null } | null;
}

export interface WsUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
}
