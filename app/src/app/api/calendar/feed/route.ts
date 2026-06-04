import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { publicBaseUrl } from "@/lib/config";
import { withRoute } from "@/lib/with-route";

// Manage the CURRENT user's calendar subscription token. This static `feed`
// segment takes precedence over the sibling dynamic `[token]` feed route.

const newToken = () => randomBytes(24).toString("base64url");
// Build the subscribe URL from the PUBLIC base (WS_DOMAIN/PUBLIC_URL), never the
// request origin — behind Caddy/Cloudflare that's the internal bind (0.0.0.0:3000).
const feedUrl = async (token: string) => `${await publicBaseUrl()}/api/calendar/${token}`;

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
  return NextResponse.json({ url: await feedUrl(token) });
});

// POST — rotate the token (revokes any existing subscriptions).
export const POST = withRoute("calendar.feed.rotate", async (req: NextRequest) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const token = newToken();
  await prisma.user.update({ where: { id: session.user.id }, data: { calendarFeedToken: token } });
  return NextResponse.json({ url: await feedUrl(token) });
});
