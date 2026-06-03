import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { withRoute } from "@/lib/with-route";

// Manage the CURRENT user's calendar subscription token. This static `feed`
// segment takes precedence over the sibling dynamic `[token]` feed route.

const newToken = () => randomBytes(24).toString("base64url");
const feedUrl = (req: NextRequest, token: string) => `${new URL(req.url).origin}/api/calendar/${token}`;

// GET — return the subscribe URL, creating a token on first use.
export const GET = withRoute("calendar.feed.get", async (req: NextRequest) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { calendarFeedToken: true } });
  let token = u?.calendarFeedToken || null;
  if (!token) {
    token = newToken();
    await prisma.user.update({ where: { id: session.user.id }, data: { calendarFeedToken: token } });
  }
  return NextResponse.json({ url: feedUrl(req, token) });
});

// POST — rotate the token (revokes any existing subscriptions).
export const POST = withRoute("calendar.feed.rotate", async (req: NextRequest) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const token = newToken();
  await prisma.user.update({ where: { id: session.user.id }, data: { calendarFeedToken: token } });
  return NextResponse.json({ url: feedUrl(req, token) });
});
