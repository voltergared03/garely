import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { userCanAccessMeeting } from "@/lib/access";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { publicBaseUrl } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/meetings/[id]/invite.ics — a downloadable calendar event for the
// "Add to calendar" button. Auth: the meeting's joinToken (so emailed guests
// can use it) or meeting access for a logged-in user.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token");

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true, scheduledAt: true, durationMin: true, joinToken: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  let ok = !!token && !!meeting.joinToken && token === meeting.joinToken;
  if (!ok) {
    const session = await auth();
    if (session?.user) ok = await userCanAccessMeeting(id, session.user.id, session.user.role);
  }
  if (!ok) return new NextResponse("Forbidden", { status: 403 });
  if (!meeting.scheduledAt) return new NextResponse("Meeting is not scheduled", { status: 404 });

  const appUrl = await publicBaseUrl();
  const joinUrl = `${appUrl}/room/${meeting.id}`;
  const start = meeting.scheduledAt;
  const end = new Date(start.getTime() + (meeting.durationMin || 60) * 60_000);
  const event: IcsEvent = {
    uid: `meeting-${meeting.id}@ezmeet`,
    start, end,
    summary: meeting.title,
    description: meeting.description ? `${meeting.description}\n\n${joinUrl}` : joinUrl,
    location: joinUrl,
    url: joinUrl,
    stamp: new Date(),
    organizer: meeting.createdBy?.email ? { email: meeting.createdBy.email, name: meeting.createdBy.name } : undefined,
  };
  const ics = buildCalendar({ name: meeting.title, method: "PUBLISH", events: [event] });
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="meeting.ics"',
    },
  });
}
