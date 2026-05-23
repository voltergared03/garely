import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { userCanAccessMeeting } from '@/lib/access';
import { notify } from '@/lib/notify';

// GET /api/meetings/:id/notes — get meeting notes
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!(await userCanAccessMeeting(id, session.user.id, (session.user as any).role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const note = await prisma.meetingNote.findUnique({
    where: { meetingId: id },
  });

  return NextResponse.json({ content: note?.content || '', updatedAt: note?.updatedAt || null });
}

// PATCH /api/meetings/:id/notes — update meeting notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!(await userCanAccessMeeting(id, session.user.id, (session.user as any).role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const { content } = body;

  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  const existing = await prisma.meetingNote.findUnique({ where: { meetingId: id }, select: { content: true } });
  const oldContent = existing?.content || '';

  const note = await prisma.meetingNote.upsert({
    where: { meetingId: id },
    update: { content, updatedBy: session.user.id },
    create: { meetingId: id, content, updatedBy: session.user.id },
  });

  // Detect newly-added @mentions and notify matched participants
  try {
    const tokensOf = (s: string) => {
      const set = new Set<string>();
      const re = /@([a-zA-Zа-яёА-ЯЁіїєґІЇЄҐ0-9._-]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) set.add(m[1].toLowerCase());
      return set;
    };
    const oldTokens = tokensOf(oldContent);
    const newTokens = [...tokensOf(content)].filter((t) => !oldTokens.has(t));
    if (newTokens.length > 0) {
      const parts = await prisma.meetingParticipant.findMany({
        where: { meetingId: id, userId: { not: null } },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      const matched = new Set<string>();
      for (const t of newTokens) {
        for (const p of parts) {
          if (!p.user || p.user.id === session.user.id) continue;
          const nameWords = (p.user.name || '').toLowerCase().split(/\s+/);
          const emailLocal = (p.user.email || '').split('@')[0].toLowerCase();
          if (nameWords.includes(t) || emailLocal === t) matched.add(p.user.id);
        }
      }
      if (matched.size > 0) {
        const meeting = await prisma.meeting.findUnique({ where: { id }, select: { title: true } });
        await notify({
          userIds: [...matched],
          type: 'mention',
          title: 'Вас згадали в нотатках',
          body: `${session.user?.name || 'Хтось'} згадав(ла) вас у "${meeting?.title || 'мітингу'}"`,
          link: `/meetings/${id}/report`,
          meetingId: id,
        });
      }
    }
  } catch (e) {
    console.error('mention detection failed', e);
  }

  return NextResponse.json({ content: note.content, updatedAt: note.updatedAt });
}
