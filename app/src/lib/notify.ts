/**
 * Central notification helper. Persists in-app Notification rows AND fans the
 * same message out as a Web Push (so it reaches closed tabs / installed PWAs).
 * Both steps are best-effort and never throw — callers can `await` without a
 * try/catch. NODE-ONLY (pulls in web-push via ./push).
 */
import { prisma } from './prisma';
import { sendPushToUsers } from './push';

export interface NotifyInput {
  userIds: string[];
  /** meeting_starting | task_assigned | report_ready | action_item | mention */
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  meetingId?: string | null;
}

export async function notify(input: NotifyInput): Promise<number> {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (userIds.length === 0) return 0;

  // 1) Persist in-app notifications (drives the bell + unread count).
  await prisma.notification
    .createMany({
      data: userIds.map((uid) => ({
        userId: uid,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        meetingId: input.meetingId ?? null,
      })),
    })
    .catch((e) => {
      console.error('[notify] createMany failed:', e);
    });

  // 2) Fan out as Web Push (best-effort; closed tabs / installed PWA).
  await sendPushToUsers(userIds, {
    title: input.title,
    body: input.body ?? undefined,
    url: input.link ?? '/',
    tag: `${input.type}-${input.meetingId ?? 'general'}`,
    type: input.type,
  }).catch(() => {});

  return userIds.length;
}
