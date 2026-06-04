import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { withRoute } from "@/lib/with-route";
import { userCanViewTask } from "@/lib/access";
import { jsonError } from "@/lib/http";
import { setTaskAssignees } from "@/lib/task-assignees";
import { notifyTaskAssigned } from "@/lib/task-notify";

// Manage a task's (or subtask's) set of assignees. Mirrors the collaborators
// route, but writes go through setTaskAssignees so MeetingTask.assigneeId (the
// denormalized lead) stays in sync.
type Ctx = { params: Promise<{ id: string }> };
const userSel = { select: { id: true, name: true, image: true } };
const postSchema = z.object({ userId: z.string().trim().min(1) });

const listAssignees = (taskId: string) =>
  prisma.taskAssignment.findMany({ where: { taskId }, include: { user: userSel }, orderBy: { createdAt: "asc" } });

// GET /api/tasks/[id]/assignees — list (view-gated).
export const GET = withRoute("tasks.assignees.list", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);
  return NextResponse.json(await listAssignees(id));
});

// POST /api/tasks/[id]/assignees { userId } — add an assignee + notify them.
export const POST = withRoute("tasks.assignees.add", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError("invalid_body", 400);
  const u = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!u) return jsonError("user_not_found", 404);

  const existing = await prisma.taskAssignment.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" }, select: { userId: true } });
  const ids = existing.map((r) => r.userId);
  if (!ids.includes(parsed.data.userId)) {
    await setTaskAssignees(id, [...ids, parsed.data.userId]);
    void notifyTaskAssigned(id, parsed.data.userId, { id: session.user.id, name: session.user.name });
  }
  return NextResponse.json(await listAssignees(id), { status: 201 });
});

// DELETE /api/tasks/[id]/assignees?userId=... — remove an assignee.
export const DELETE = withRoute("tasks.assignees.remove", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return jsonError("userId required", 400);
  const existing = await prisma.taskAssignment.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" }, select: { userId: true } });
  await setTaskAssignees(id, existing.map((r) => r.userId).filter((x) => x !== userId));
  return NextResponse.json({ ok: true });
});
