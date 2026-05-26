import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { readConfig, CONFIG_DEFAULTS, publicBaseUrl } from '@/lib/config';
import { getTranslator, workspaceLocale } from '@/lib/i18n-server';

// POST /api/users/invite — invite a user by email (admin only).
// Pre-creates the user with the chosen role and emails a login link.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // The invite is sent in the workspace default language (the recipient has no
  // saved preference yet, even when pre-created).
  const locale = await workspaceLocale();
  const t = getTranslator(locale);

  const body = await req.json().catch(() => ({} as any));
  const email = String(body.email || '').trim().toLowerCase();
  const role = ['admin', 'member', 'viewer'].includes(body.role) ? body.role : 'member';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: t('emails.invite.errors.invalidEmail') }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  let user;
  let created = false;
  if (existing) {
    user = await prisma.user.update({ where: { id: existing.id }, data: { role } });
  } else {
    // Apply workspace defaults (timezone / language) to the invited user.
    const cfg = await readConfig(['WS_TIMEZONE', 'WS_LANGUAGE']);
    user = await prisma.user.create({
      data: {
        email,
        role,
        name: email.split('@')[0],
        timezone: cfg.WS_TIMEZONE || CONFIG_DEFAULTS.WS_TIMEZONE,
        preferences: { language: cfg.WS_LANGUAGE || CONFIG_DEFAULTS.WS_LANGUAGE },
      },
    });
    created = true;
  }

  const appUrl = await publicBaseUrl();
  const inviterName = session.user.name || t('emails.common.adminFallback');
  const roleLabel = role === 'admin' ? t('emails.invite.roles.admin') : role === 'viewer' ? t('emails.invite.roles.viewer') : t('emails.invite.roles.member');

  const sent = await sendEmail({
    to: email,
    template: 'invite',
    subject: t('emails.invite.subject'),
    text: t('emails.invite.bodyText', { inviter: inviterName, role: roleLabel, url: `${appUrl}/login` }),
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1115;border-radius:16px;color:#e8eaed">
      <div style="font-size:22px;font-weight:700;margin-bottom:8px">${t('emails.invite.heading')}</div>
      <p style="color:#9aa0a6;line-height:1.5;margin:0 0 18px">${t.rich('emails.invite.bodyHtml', { inviter: inviterName, role: roleLabel, b: (c: any) => `<b style="color:#e8eaed">${c}</b>` })}</p>
      <a href="${appUrl}/login" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">${t('emails.invite.cta')} →</a>
    </div>`,
  });

  return NextResponse.json({
    success: true,
    created,
    emailSent: sent.ok,
    user: { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role, lastLogin: user.lastLogin },
  });
}
