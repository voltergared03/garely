import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { listDecisions } from "@/lib/decisions";

/**
 * GET /api/decisions — the meeting-decisions registry (Phase 4.2, roadmap §16).
 *
 * Read-only and bespoke: decisions are Rows in the per-org system "Decisions"
 * table, which the generic base/row APIs refuse (the 3.2 system-table guard),
 * so this mirrors /api/tasks. `listDecisions` applies per-decision authz (a
 * user sees a decision only if they can access its source meeting; admins see
 * all), then optional meeting/owner/text filters. There is intentionally no
 * POST/PATCH/DELETE: decisions are AI-derived from reports (regenerate.ts), so
 * the registry adds no write surface in v1.
 */
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const decisions = await listDecisions(session, {
    meetingId: url.searchParams.get("meetingId"),
    owner: url.searchParams.get("owner"),
    q: url.searchParams.get("q"),
  });
  return NextResponse.json(decisions);
}
