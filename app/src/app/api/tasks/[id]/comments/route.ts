import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { withRoute } from "@/lib/with-route";
import { userCanViewTask } from "@/lib/access";
import { jsonError } from "@/lib/http";
import { notify } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };
const userSel = { select: { id: true, name: true, image: true } };

const postSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  // explicit @mentions (user IDs); the client sends these, the server gates them
  mentions: z.array(z.string()).optional(),
});

// GET /api/tasks/[id]/comments — list the thread (view-gated).
export const GET = withRoute("tasks.comments.list", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const comments = await prisma.taskComment.findMany({
    where: { taskId: id },
    include: { user: userSel },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(comments);
});

// POST /api/tasks/[id]/comments — add a comment + fan out notifications.
export const POST = withRoute("tasks.comments.create", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError("invalid_body", 400);

  const task = await prisma.meetingTask.findUnique({
    where: { id },
    select: { title: true, assigneeId: true, departmentId: true, collaborators: { select: { userId: true } } },
  });
  if (!task) return jsonError("not_found", 404);

  const authorId = session.user.id;
  const authorName = session.user.name || null;

  const comment = await prisma.taskComment.create({
    data: { taskId: id, userId: authorId, authorName, body: parsed.data.body },
    include: { user: userSel },
  });

  // Notification audience = assignee + collaborators + (if departmental) dept members.
  const audience = new Set<string>();
  if (task.assigneeId) audience.add(task.assigneeId);
  for (const c of task.collaborators) audience.add(c.userId);
  if (task.departmentId) {
    const members = await prisma.departmentMember.findMany({
      where: { departmentId: task.departmentId },
      select: { userId: true },
    });
    for (const m of members) audience.add(m.userId);
  }
  audience.delete(authorId);

  // @mentions only reach people already in the audience — no leaking to outsiders.
  const mentioned = (parsed.data.mentions || []).filter((u) => audience.has(u));
  const mentionedSet = new Set(mentioned);
  const link = `/tasks?task=${id}`;
  const values = { name: authorName || "", title: task.title };

  if (mentioned.length > 0) {
    await notify({ userIds: mentioned, type: "mention", titleKey: "taskMentionTitle", bodyKey: "taskMentionBody", values, link });
  }
  const others = [...audience].filter((u) => !mentionedSet.has(u));
  if (others.length > 0) {
    await notify({ userIds: others, type: "task_comment", titleKey: "taskCommentTitle", bodyKey: "taskCommentBody", values, link });
  }

  return NextResponse.json(comment, { status: 201 });
});

// DELETE /api/tasks/[id]/comments?commentId=... — author or admin only.
export const DELETE = withRoute("tasks.comments.delete", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const commentId = new URL(req.url).searchParams.get("commentId");
  if (!commentId) return jsonError("commentId required", 400);

  const comment = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { taskId: true, userId: true } });
  if (!comment || comment.taskId !== id) return jsonError("not_found", 404);
  if (session.user.role !== "admin" && comment.userId !== session.user.id) return jsonError("forbidden", 403);

  await prisma.taskComment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
});
