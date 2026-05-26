import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { getTranslator, workspaceLocale } from '@/lib/i18n-server';
import { publicBaseUrl } from '@/lib/config';
import { esc } from '@/lib/email/html';
import { withRoute } from '@/lib/with-route';

// GET /api/cron/digest?secret=XXX — weekly digest for users who enabled it.
async function getHandler(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86400000);
  const appUrl = await publicBaseUrl();

  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      preferences: { path: ['weeklyDigest'], equals: true },
    },
    select: { id: true, email: true, name: true },
  });

  let sent = 0;
  // Digest emails go out in the workspace (admin-chosen) language.
  const locale = await workspaceLocale();
  const t = getTranslator(locale);
  for (const u of users) {
    if (!u.email) continue;
    const [tasks, meetingCount] = await Promise.all([
      prisma.meetingTask.findMany({
        where: { assigneeId: u.id, status: { not: 'done' } },
        select: { title: true },
        take: 25,
      }),
      prisma.meetingParticipant.count({
        where: { userId: u.id, meeting: { endedAt: { gte: weekStart } } },
      }),
    ]);

    if (tasks.length === 0 && meetingCount === 0) continue;

    const tasksHtml = tasks.length
      ? `<ul style="margin:0;padding-left:18px;color:#c4c9d4;font-size:14px;line-height:1.6">${tasks.map((tk) => `<li>${esc(tk.title)}</li>`).join('')}</ul>`
      : `<p style="color:#9aa0a6;margin:0">${esc(t('emails.digest.noOpenTasks'))}</p>`;

    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:28px 26px;background:#0f1115;border-radius:16px;color:#e8eaed">
      <div style="font-size:13px;color:#60a5fa;text-transform:uppercase;letter-spacing:.08em;font-weight:700">${esc(t('emails.digest.eyebrow'))}</div>
      <div style="font-size:21px;font-weight:700;margin:4px 0 14px">${esc(u.name ? t('emails.digest.greetingNamed', { name: u.name }) : t('emails.digest.greeting'))}</div>
      <p style="color:#c4c9d4;font-size:14px;margin:0 0 16px">${t.rich('emails.digest.meetingsLine', { count: meetingCount, b: (c: any) => `<b style="color:#e8eaed">${c}</b>` })}</p>
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${esc(t('emails.digest.openTasksHeading', { count: tasks.length }))}</div>
      ${tasksHtml}
      ${appUrl ? `<a href="${appUrl}/tasks" style="display:inline-block;margin-top:22px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px">${esc(t('emails.digest.cta'))} →</a>` : ''}
    </div>`;

    const text = `${t('emails.digest.eyebrow')}\n\n${t('emails.digest.meetingsLineText', { count: meetingCount })}\n${t('emails.digest.openTasksHeading', { count: tasks.length })}:\n${tasks.map((tk) => `- ${tk.title}`).join('\n')}${appUrl ? `\n\n${appUrl}/tasks` : ''}`;

    const r = await sendEmail({ to: u.email, subject: t('emails.digest.subject'), html, text, template: 'digest' });
    if (r.ok) sent++;
  }

  return NextResponse.json({ users: users.length, sent });
}

export const GET = withRoute('cron.digest', getHandler);
