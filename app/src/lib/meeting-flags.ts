/**
 * The four per-meeting switches ("AI and communication"): what the create page sets and
 * what the edit dialogs can now change. One shape on the client, one mapping to the API
 * column names, one place for the defaults — so a missing field on an older meeting row
 * cannot silently flip a switch.
 */
export interface MeetingFlags {
  transcription: boolean;
  aiReport: boolean;
  taskCreation: boolean;
  allowGuests: boolean;
}

/** Matches the Prisma defaults (taskCreation is off by default since 1.25.0-beta.10). */
export const DEFAULT_MEETING_FLAGS: MeetingFlags = {
  transcription: true,
  aiReport: true,
  taskCreation: false,
  allowGuests: true,
};

export interface MeetingFlagFields {
  transcriptionEnabled?: boolean | null;
  aiReportEnabled?: boolean | null;
  taskCreationEnabled?: boolean | null;
  allowGuests?: boolean | null;
}

/** Read a meeting's switches; an absent/null field falls back to the default, `false` is kept. */
export function flagsFromMeeting(m: MeetingFlagFields | null | undefined): MeetingFlags {
  return {
    transcription: m?.transcriptionEnabled ?? DEFAULT_MEETING_FLAGS.transcription,
    aiReport: m?.aiReportEnabled ?? DEFAULT_MEETING_FLAGS.aiReport,
    taskCreation: m?.taskCreationEnabled ?? DEFAULT_MEETING_FLAGS.taskCreation,
    allowGuests: m?.allowGuests ?? DEFAULT_MEETING_FLAGS.allowGuests,
  };
}

/** The PATCH/POST body fields for a set of switches. */
export function flagsToBody(f: MeetingFlags): Required<MeetingFlagFields> {
  return {
    transcriptionEnabled: f.transcription,
    aiReportEnabled: f.aiReport,
    taskCreationEnabled: f.taskCreation,
    allowGuests: f.allowGuests,
  };
}
