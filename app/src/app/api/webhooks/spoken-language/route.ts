import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isInternalAuthed } from '@/lib/internal-auth';

// POST /api/webhooks/spoken-language — persist a user's detected spoken language
// (called internally by the agent after a meeting, or seeded by a manual report
// correction). Stored in preferences.spokenLanguage so future meetings start
// that user's STT in the right language. Internal-only.
export async function POST(req: NextRequest) {
  if (!isInternalAuthed(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { userId, language, confidence, source } = body;

    if (!userId || typeof language !== 'string' || !language.trim()) {
      return NextResponse.json({ error: 'userId and language required' }, { status: 400 });
    }
    const lang = language.trim().toLowerCase().slice(0, 8);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const prefs = (user.preferences as any) || {};
    const updated = {
      ...prefs,
      spokenLanguage: lang,
      spokenLanguageMeta: {
        confidence: typeof confidence === 'number' ? confidence : null,
        source: typeof source === 'string' ? source : 'detected',
        at: new Date().toISOString(),
      },
    };

    await prisma.user.update({ where: { id: userId }, data: { preferences: updated } });

    return NextResponse.json({ ok: true, spokenLanguage: lang });
  } catch (e) {
    console.error('spoken-language webhook error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
