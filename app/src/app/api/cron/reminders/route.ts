import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

// GET /api/cron/reminders?secret=XXX — called by system cron (every few minutes).
// Sends "meeting starting soon" in-app notifications + emails ~15 min before start.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const in15 = new Date(now.getTime() + 15 * 60000);

  const meetings = await prisma.meeting.findMany({
    where: {
      status: 'scheduled',
      reminderSent: false,
      scheduledAt: { gt: now, lte: in15 },
    },
    include: {
      participants: { include: { user: { select: { id: true, email: true, preferences: true } } } },
    },
  });

  const appUrl = (process.env.APP_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  let notified = 0;
  let emailed = 0;

  for (const m of meetings) {
    const startStr = m.scheduledAt
      ? new Date(m.scheduledAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
      : '';

    // In-app notifications for participant users
    const userIds = m.participants.map((p) => p.user?.id).filter((x): x is string => !!x);
    if (userIds.length > 0) {
      await prisma.notification.createMany({
        data: userIds.map((uid) => ({
          userId: uid,
          type: 'meeting_starting',
          title: 'Мітинг скоро почнеться',
          body: `"${m.title}" о ${startStr}`,
          link: `/lobby/${m.id}`,
          meetingId: m.id,
        })),
      }).catch(() => {});
      notified += userIds.length;
    }

    // Emails — respect each user's emailReminder preference; always send to guests
    const emails = new Set<string>();
    for (const p of m.participants) {
      if (p.user?.email) {
        const prefs = (p.user.preferences as any) || {};
        if (prefs.emailReminder !== false) emails.add(p.user.email);
      }
      if (p.guestEmail) emails.add(p.guestEmail);
    }
    if (emails.size > 0) {
      const joinUrl = `${appUrl}/lobby/${m.id}`;
      await sendEmail({
        to: [...emails],
        template: 'reminder',
        meetingId: m.id,
        subject: `Нагадування: "${m.title}" о ${startStr}`,
        text: `Мітинг "${m.title}" почнеться о ${startStr}.\nПриєднатися: ${joinUrl}`,
        html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1115;border-radius:16px;color:#e8eaed">
          <div style="font-size:13px;color:#60a5fa;text-transform:uppercase;letter-spacing:.08em;font-weight:700">Нагадування</div>
          <div style="font-size:21px;font-weight:700;margin:4px 0 6px">${esc(m.title)}</div>
          <p style="color:#9aa0a6;margin:0 0 18px">Почнеться о <b style="color:#e8eaed">${startStr}</b> (приблизно за 15 хв).</p>
          ${appUrl ? `<a href="${joinUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">Приєднатися →</a>` : ''}
        </div>`,
      }).catch(() => {});
      emailed += emails.size;
    }

    await prisma.meeting.update({ where: { id: m.id }, data: { reminderSent: true } }).catch(() => {});
  }

  return NextResponse.json({ processed: meetings.length, notified, emailed });
}
