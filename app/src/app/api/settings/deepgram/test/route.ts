import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readConfig } from '@/lib/config';

// POST /api/settings/deepgram/test — validate the saved Deepgram key.
export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const m = await readConfig(['DEEPGRAM_API_KEY']);
  const key = m.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY || '';
  if (!key) {
    return NextResponse.json({ error: 'Deepgram API key не задано' }, { status: 400 });
  }
  try {
    const res = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${key}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Deepgram ${res.status}` }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Не вдалося підключитись' }, { status: 502 });
  }
}
