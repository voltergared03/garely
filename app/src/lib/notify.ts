/**
 * Central notification helper. Persists in-app Notification rows AND fans the
 * same message out as a Web Push (so it reaches closed tabs / installed PWAs).
 * Both steps are best-effort and never throw — callers can `await` without a
 * try/catch. NODE-ONLY (pulls in web-push via ./push).
 */
import { prisma } from './prisma';
import { sendPushToUsers } from './push';
import { getTranslator, workspaceLocale } from './i18n-server';
import { getSingletonOrgId } from './org';

export interface NotifyInput {
  userIds: string[];
  /** meeting_starting | task_assigned | report_ready | action_item | mention */
  type: string;
  /**
   * Preferred: translation keys (under the `notifications` namespace) rendered
   * per-recipient in their own locale. `values` are interpolated into both.
   */
  titleKey?: string;
  bodyKey?: string;
  values?: Record<string, string | number>;
  /** Legacy / fallback: pre-formatted strings used when no *Key is given. */
  title?: string;
  body?: string | null;
  link?: string | null;
  meetingId?: string | null;
}

export async function notify(input: NotifyInput): Promise<number> {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (userIds.length === 0) return 0;

  // Notification copy is system-generated, so (like emails & AI output) it's
  // rendered in the workspace (admin-chosen) language — the same for every
  // recipient, regardless of each person's interface-language preference.
  let title: string;
  let body: string | null;
  if (input.titleKey) {
    const t = getTranslator(await workspaceLocale(), 'notifications');
    title = t(input.titleKey as any, input.values);
    body = input.bodyKey ? t(input.bodyKey as any, input.values) : (input.body ?? null);
  } else {
    title = input.title ?? '';
    body = input.body ?? null;
  }

  // 1) Persist in-app notifications (drives the bell + unread count).
  const orgId = await getSingletonOrgId();
  await prisma.notification
    .createMany({
      data: userIds.map((uid) => ({
        userId: uid,
        type: input.type,
        title,
        body,
        link: input.link ?? null,
        meetingId: input.meetingId ?? null,
        orgId,
      })),
    })
    .catch((e) => {
      console.error('[notify] createMany failed:', e);
    });

  // 2) Fan out as Web Push (best-effort; closed tabs / installed PWA).
  await sendPushToUsers(userIds, {
    title,
    body: body ?? undefined,
    url: input.link ?? '/',
    tag: `${input.type}-${input.meetingId ?? 'general'}`,
    type: input.type,
  }).catch(() => {});

  return userIds.length;
}
