import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { getDeepSeekConfig } from '@/lib/config';

// POST /api/settings/deepseek/test — validate the saved DeepSeek key with a 1-token call.
export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const errT = await getTranslations('errors');
  const { apiKey, baseUrl, model } = await getDeepSeekConfig();
  if (!apiKey) {
    return NextResponse.json({ error: errT('deepseekKeyMissing') }, { status: 400 });
  }
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return NextResponse.json({ error: `DeepSeek ${res.status}: ${t.slice(0, 120)}` }, { status: 502 });
    }
    return NextResponse.json({ success: true, model });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || errT('connectionFailed') }, { status: 502 });
  }
}
