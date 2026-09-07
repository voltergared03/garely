// Meeting lifecycle helpers.
//
// Re-opening a rescheduled meeting: an overdue meeting that was briefly opened
// (someone joined for a moment, then left → room_finished marks it `ended`) and
// then moved to a NEW future time must NOT keep showing as completed. Moving a
// meeting to a future time means it hasn't happened yet, so it should become
// `scheduled` again — but only when the prior attempt produced nothing real (no
// report, no transcript), so a genuine past report is never silently discarded.

export interface ReopenInput {
  /** The meeting's current status before this update. */
  currentStatus: string;
  /** True when the PATCH body explicitly carried a `status` (caller's intent wins). */
  statusExplicitlySet: boolean;
  /** The new scheduledAt being set (null when cleared / not a real date). */
  newScheduledAt: Date | null;
  /** True when scheduledAt is actually being moved (present in the body and != current). */
  scheduledAtChanged: boolean;
  /** Whether the meeting has any real content (a report or transcript segments). */
  hasRealContent: boolean;
}

/**
 * Should a meeting be re-opened (status → scheduled, endedAt/report cleared)
 * because it is being rescheduled? An overdue meeting that was briefly opened
 * (someone glanced in, no one spoke → `room_finished` marks it `ended`) and is
 * then MOVED to a new time hasn't actually happened — it must return to the
 * upcoming state rather than keep showing as completed with a (phantom) report.
 *
 * Fires only for a meeting that was already done (`ended`/`cancelled`), produced
 * NO real content (no report, no transcript — so nothing genuine is discarded),
 * and whose time is genuinely being moved. Never when the caller set `status`
 * itself. The new time can be past or future — moving a never-happened meeting
 * always means "it will happen at the new time."
 */
export function shouldReopenOnReschedule(input: ReopenInput): boolean {
  if (input.statusExplicitlySet) return false;
  if (input.currentStatus !== 'ended' && input.currentStatus !== 'cancelled') return false;
  if (input.hasRealContent) return false;
  if (!input.newScheduledAt) return false;
  return input.scheduledAtChanged;
}

export type LiveRescheduleAction = 'none' | 'conflict' | 'reset';

export interface LiveRescheduleInput {
  /** The meeting's current status before this update. */
  currentStatus: string;
  /** True when the PATCH body explicitly carried a `status` (caller's intent wins). */
  statusExplicitlySet: boolean;
  /** True when scheduledAt is actually being moved (present in the body and != current). */
  scheduledAtChanged: boolean;
  /** classifyAttempt's verdict for the CURRENT attempt — `held` means it is really happening. */
  verdict: 'held' | 'abandoned';
}

/**
 * Rescheduling a meeting that is `live` right now — someone is already in the room.
 *
 * Two very different situations look identical in the database:
 *   - a real meeting in progress: people are talking, a transcript is growing. Moving it
 *     to another time makes no sense — the host should end it or create a new one.
 *     → `conflict`: refuse with a clear message, change nothing.
 *   - a false start: an invitee opened the room early (or the host clicked in and out),
 *     nothing was said. The host now moves the meeting to when it will really happen.
 *     → `reset`: allow the move, close the room so the early visitor lands back in the
 *       lobby with the new time, and return the meeting to `scheduled` as if the false
 *       start never happened (fresh startedAt on the real join, no phantom "ended").
 *
 * The line between the two is the same held/abandoned verdict the post-meeting pipeline
 * uses, so a meeting is never wiped while it has real content. Never fires when the
 * caller set `status` itself, and never when the time is not actually moving.
 */
export function liveRescheduleAction(input: LiveRescheduleInput): LiveRescheduleAction {
  if (input.statusExplicitlySet) return 'none';
  if (input.currentStatus !== 'live') return 'none';
  if (!input.scheduledAtChanged) return 'none';
  return input.verdict === 'held' ? 'conflict' : 'reset';
}
