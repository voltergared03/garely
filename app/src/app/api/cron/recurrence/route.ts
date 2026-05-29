import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateMeetingSlug } from '@/lib/utils';
import { withRoute } from '@/lib/with-route';

// GET /api/cron/recurrence?secret=XXX — materialize recurring meetings (hourly).
// Each occurrence whose time has passed spawns exactly ONE future successor
// (idempotent via the recurrenceMaterialized flag + a transaction), keeping the
// series a single step ahead. Missed occurrences are skipped (we advance to the
// next future slot) so a long-dormant series doesn't create a burst.

function nextOccurrenceAfter(from: Date, type: string, now: number): Date {
  const d = new Date(from);
  const step = () => {
    switch (type) {
      case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
      case 'biweekly': d.setUTCDate(d.getUTCDate() + 14); break;
      case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
      case 'weekly':
      default: d.setUTCDate(d.getUTCDate() + 7); break;
    }
  };
  step();
  let guard = 0;
  while (d.getTime() <= now && guard++ < 1000) step();
  return d;
}

async function getHandler(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = Date.now();
  const due = await prisma.meeting.findMany({
    where: {
      recurrenceMaterialized: false,
      recurrence: { not: Prisma.DbNull },
      status: { not: 'cancelled' },
      scheduledAt: { not: null, lt: new Date(now) },
    },
    include: {
      participants: { select: { userId: true, guestEmail: true, guestName: true, role: true } },
    },
    take: 200,
  });

  let created = 0;
  for (const m of due) {
    const rec = (m.recurrence ?? {}) as { type?: string; seriesId?: string };
    if (!m.scheduledAt || !rec.type) {
      // Malformed/empty recurrence — flag it so we don't re-scan it forever.
      await prisma.meeting.update({ where: { id: m.id }, data: { recurrenceMaterialized: true } }).catch(() => {});
      continue;
    }
    const type = rec.type;
    const seriesId = rec.seriesId || generateMeetingSlug();
    const nextAt = nextOccurrenceAfter(m.scheduledAt, type, now);
    const roomSlug = generateMeetingSlug();
    try {
      await prisma.$transaction([
        prisma.meeting.create({
          data: {
            title: m.title,
            description: m.description,
            createdById: m.createdById,
            scheduledAt: nextAt,
            durationMin: m.durationMin,
            recurrence: { type, seriesId },
            livekitRoom: `meet-${roomSlug}`,
            joinToken: generateMeetingSlug(),
            transcriptionEnabled: m.transcriptionEnabled,
            aiReportEnabled: m.aiReportEnabled,
            allowGuests: m.allowGuests,
            agenda: m.agenda ?? Prisma.JsonNull,
            status: 'scheduled',
            participants: {
              create: m.participants.map((p) => ({
                userId: p.userId || null,
                guestEmail: p.guestEmail || null,
                guestName: p.guestName || null,
                role: p.role || 'participant',
                rsvpStatus: p.role === 'host' ? 'accepted' : 'pending',
              })),
            },
          },
        }),
        prisma.meeting.update({ where: { id: m.id }, data: { recurrenceMaterialized: true } }),
      ]);
      created++;
    } catch (e) {
      console.error(`recurrence materialize failed for ${m.id}:`, e);
    }
  }

  return NextResponse.json({ created });
}

export const GET = withRoute('cron.recurrence', getHandler);
