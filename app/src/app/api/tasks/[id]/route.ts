import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { withRoute } from "@/lib/with-route";
import { userCanViewTask } from "@/lib/access";
import { getTaskById } from "@/lib/tasks";
import { jsonError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/tasks/[id] — full task detail for the modal: subtasks, comments,
// attachments and collaborators in a single fetch. View-gated. (Tasks are now
// base-engine Rows; the adapter assembles the legacy MeetingTask-shaped DTO.)
export const GET = withRoute("tasks.detail", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  if (!(await userCanViewTask(id, session.user.id, session.user.role))) {
    return jsonError("forbidden", 403);
  }

  const task = await getTaskById(id, { detail: true });
  if (!task) return jsonError("not_found", 404);
  return NextResponse.json(task);
});
