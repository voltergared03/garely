import { prisma } from './prisma';
import { notify } from './notify';
import { workspaceLocale, workspaceTimezone } from './i18n-server';
import { fmtDateLong, fmtTime } from './utils';

/**
 * In-app + push notice to a meeting's participants that its time moved. Emails already
 * carried this (meeting_update with a fresh .ics); the bell did not, so someone who
 * lives in the app rather than the inbox found out from an empty lobby. Used by the
 * edit dialogs (PATCH) and by the Google → Garely sync, which moves meetings silently
 * when the event is dragged in the calendar.
 *
 * `exceptUserId` — whoever made the change; they know.
 */
export async function notifyMeetingRescheduled(meetingId: string, opts: { exceptUserId?: string | null } = {}): Promise<number> {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true, title: true, scheduledAt: true,
      participants: { select: { userId: true, user: { select: { status: true } } } },
    },
  });
  if (!m?.scheduledAt) return 0;
  const userIds = m.participants
    .filter((p) => p.userId && p.userId !== opts.exceptUserId && p.user?.status !== 'disabled')
    .map((p) => p.userId as string);
  if (!userIds.length) return 0;
  const [locale, tz] = await Promise.all([workspaceLocale(), workspaceTimezone()]);
  const when = `${fmtDateLong(m.scheduledAt, locale, tz)}, ${fmtTime(m.scheduledAt, tz)}`;
  return notify({
    userIds,
    type: 'meeting_rescheduled',
    titleKey: 'meetingRescheduledTitle',
    bodyKey: 'meetingRescheduledBody',
    values: { title: m.title, time: when },
    link: `/lobby/${m.id}`,
    meetingId: m.id,
  });
}
