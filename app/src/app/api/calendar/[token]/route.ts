import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { publicBaseUrl } from "@/lib/config";
import { getSingletonOrgId } from "@/lib/org";
import { icsTasksForUser } from "@/lib/tasks";

// Public feed: the secret token in the URL is the only credential (standard
// ICS-subscription model). No session — calendar apps fetch this server-side.
// Middleware is fail-open for tokenless requests, so this passes through.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const token = ((await ctx.params).token || "").replace(/\.ics$/i, "");
  if (!token) return new NextResponse("Not found", { status: 404 });

  const user = await prisma.user.findUnique({
    where: { calendarFeedToken: token },
    select: { id: true, name: true },
  });
  if (!user) return new NextResponse("Not found", { status: 404 });

  const now = new Date();
  const DAY = 86_400_000;
  const from = new Date(now.getTime() - 30 * DAY);
  const to = new Date(now.getTime() + 180 * DAY);
  // Public base (WS_DOMAIN/PUBLIC_URL), not the request origin — behind a proxy
  // that resolves to the internal bind (0.0.0.0:3000), which breaks event links.
  const origin = await publicBaseUrl();

  // The user's own meetings (created or participating) within a bounded window.
  const meetings = await prisma.meeting.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      OR: [{ createdById: user.id }, { participants: { some: { userId: user.id } } }],
    },
    select: { id: true, title: true, scheduledAt: true, durationMin: true },
  });

  // The user's own open tasks (assignee or collaborator) that have a deadline —
  // now base-engine Rows in the user's org system Tasks table.
  const membership = await prisma.membership.findFirst({ where: { userId: user.id }, select: { orgId: true } });
  const orgId = membership?.orgId ?? (await getSingletonOrgId());
  const tasks = orgId ? await icsTasksForUser(orgId, user.id) : [];

  const events: IcsEvent[] = [];
  for (const m of meetings) {
    if (!m.scheduledAt) continue;
    const start = m.scheduledAt;
    const end = new Date(start.getTime() + (m.durationMin || 30) * 60_000);
    const link = `${origin}/room/${m.id}`;
    events.push({ uid: `meeting-${m.id}@ezmeet`, start, end, summary: m.title, location: link, url: link, stamp: now });
  }
  for (const t of tasks) {
    if (!t.dueDate) continue;
    events.push({
      uid: `task-${t.id}@ezmeet`,
      start: t.dueDate,
      allDay: true,
      summary: t.title,
      url: `${origin}/tasks?task=${t.id}`,
      stamp: t.createdAt || now,
    });
  }

  const ics = buildCalendar({ name: `Garely — ${user.name || "Calendar"}`, events });
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="garely.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
