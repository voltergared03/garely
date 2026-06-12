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
