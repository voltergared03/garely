import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { readConfig, CONFIG_DEFAULTS } from '@/lib/config';

// POST /api/users/invite — invite a user by email (admin only).
// Pre-creates the user with the chosen role and emails a login link.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const email = String(body.email || '').trim().toLowerCase();
  const role = ['admin', 'member', 'viewer'].includes(body.role) ? body.role : 'member';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Невалідний email' }, { status: 400 });
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

  const appUrl = (process.env.APP_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  const inviterName = session.user.name || 'Адміністратор';
  const roleLabel = role === 'admin' ? 'Адміністратор' : role === 'viewer' ? 'Глядач' : 'Учасник';

  const sent = await sendEmail({
    to: email,
    template: 'invite',
    subject: 'Запрошення до EAM Meet',
    text: `${inviterName} запросив вас до EAM Meet (роль: ${roleLabel}). Увійдіть через Google: ${appUrl}/login`,
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1115;border-radius:16px;color:#e8eaed">
      <div style="font-size:22px;font-weight:700;margin-bottom:8px">Запрошення до EAM Meet</div>
      <p style="color:#9aa0a6;line-height:1.5;margin:0 0 18px"><b style="color:#e8eaed">${inviterName}</b> запросив вас приєднатися (роль: <b style="color:#e8eaed">${roleLabel}</b>).</p>
      <a href="${appUrl}/login" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">Увійти через Google →</a>
    </div>`,
  });

  return NextResponse.json({
    success: true,
    created,
    emailSent: sent.ok,
    user: { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role, lastLogin: user.lastLogin },
  });
}
