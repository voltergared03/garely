import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { getTranslator, workspaceLocale } from '@/lib/i18n-server';

// POST /api/settings/email/test — send a test email using the saved SMTP config
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Test email goes out in the workspace (admin-chosen) language.
  const locale = await workspaceLocale();
  const t = getTranslator(locale);

  const body = await req.json().catch(() => ({} as any));
  const to = String(body.to || session.user.email || '').trim();
  if (!to) return NextResponse.json({ error: t('emails.test.errors.noRecipient') }, { status: 400 });

  const result = await sendEmail({
    to,
    template: 'test',
    subject: t('emails.test.subject'),
    text: t('emails.test.bodyText'),
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1115;border-radius:16px;color:#e8eaed">
      <div style="font-size:22px;font-weight:700;margin-bottom:8px">${t('emails.test.heading')} ✅</div>
      <p style="color:#9aa0a6;line-height:1.5;margin:0">${t.rich('emails.test.bodyHtml', { b: (c: any) => `<b style="color:#e8eaed">${c}</b>` })}</p>
    </div>`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || t('emails.common.sendFailed') }, { status: 502 });
  }
  return NextResponse.json({ success: true, messageId: result.messageId });
}
