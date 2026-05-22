import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

// POST /api/settings/email/test — send a test email using the saved SMTP config
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const to = String(body.to || (session.user as any).email || '').trim();
  if (!to) return NextResponse.json({ error: 'Не вказано адресу одержувача' }, { status: 400 });

  const result = await sendEmail({
    to,
    template: 'test',
    subject: 'EAM Meet — тестовий лист',
    text: 'SMTP працює. Це тестовий лист з EAM Meet.',
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1115;border-radius:16px;color:#e8eaed">
      <div style="font-size:22px;font-weight:700;margin-bottom:8px">SMTP працює ✅</div>
      <p style="color:#9aa0a6;line-height:1.5;margin:0">Це тестовий лист з <b style="color:#e8eaed">EAM Meet</b>. Якщо ти його бачиш — налаштування пошти збережені й коректні.</p>
    </div>`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Не вдалося надіслати' }, { status: 502 });
  }
  return NextResponse.json({ success: true, messageId: result.messageId });
}
