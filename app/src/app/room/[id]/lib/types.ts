/* ── Types ─────────────────────────────────────────────── */
export interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  language: string;
  timestamp: number;
}

// Pre-meeting briefing surfaced inside the call (Agenda side-panel): the
// description + agenda items ("питання") entered when the meeting was scheduled.
export interface MeetingBriefing {
  title: string | null;
  description: string | null;
  agenda: string[] | null;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  sender: string;
  x: number;
}

export interface LiveAiNote {
  summary: string;
  decisions: string[];
  actionItems: string[];
  updatedAt: number;
}

export interface DetectedActionItem {
  id: string;
  title: string;
  assignee: string | null;
  timestamp: number;
  dismissed: boolean;
}

export const REACTIONS = ['👍', '👏', '😂', '❤️', '🔥', '✋', '🎉', '💡'];
