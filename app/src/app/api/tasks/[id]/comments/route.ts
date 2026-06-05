import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { withRoute } from "@/lib/with-route";
import { userCanViewTask } from "@/lib/access";
import { getSystemTasksTable } from "@/lib/system-tasks-table";
import { usersByIds } from "@/lib/tasks";
import { jsonError } from "@/lib/http";
import { notify } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

const postSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  // explicit @mentions (user IDs); the client sends these, the server gates them
  mentions: z.array(z.string()).optional(),
});

// GET /api/tasks/[id]/comments — list the thread (view-gated). Tasks are Rows;
// RowComment.userId is a soft ref (no FK), so user objects are resolved in batch.
export const GET = withRoute("tasks.comments.list", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const comments = await prisma.rowComment.findMany({ where: { rowId: id }, orderBy: { createdAt: "asc" } });
  const users = await usersByIds(comments.map((c) => c.userId));
  return NextResponse.json(
    comments.map((c) => ({
      id: c.id,
      taskId: id,
      userId: c.userId,
      authorName: c.authorName,
      body: c.body,
      createdAt: c.createdAt,
      user: c.userId ? users.get(c.userId) ?? null : null,
    })),
  );
});

// POST /api/tasks/[id]/comments — add a comment + fan out notifications.
export const POST = withRoute("tasks.comments.create", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError("invalid_body", 400);

  const row = await prisma.row.findUnique({
    where: { id },
    select: {
      data: true,
      taskMeta: { select: { departmentId: true } },
      assignments: { select: { userId: true } },
      collaborators: { select: { userId: true } },
      table: { select: { base: { select: { orgId: true } } } },
    },
  });
  if (!row) return jsonError("not_found", 404);
  const prov = await getSystemTasksTable(row.table.base.orgId);
  const title = (prov ? String(((row.data ?? {}) as Record<string, unknown>)[prov.fieldIds.title] ?? "") : "") || "";

  const authorId = session.user.id;
  const authorName = session.user.name || null;

  const comment = await prisma.rowComment.create({
    data: { rowId: id, userId: authorId, authorName, body: parsed.data.body },
  });
  const cUser = (await usersByIds([authorId])).get(authorId) ?? null;

  // Notification audience = all assignees (multi-assignee) + collaborators +
  // (if departmental) dept members.
  const audience = new Set<string>();
  for (const a of row.assignments) audience.add(a.userId);
  for (const c of row.collaborators) audience.add(c.userId);
  if (row.taskMeta?.departmentId) {
    const members = await prisma.departmentMember.findMany({
      where: { departmentId: row.taskMeta.departmentId },
      select: { userId: true },
    });
    for (const m of members) audience.add(m.userId);
  }
  audience.delete(authorId);

  // @mentions only reach people already in the audience — no leaking to outsiders.
  const mentioned = (parsed.data.mentions || []).filter((u) => audience.has(u));
  const mentionedSet = new Set(mentioned);
  const link = `/tasks?task=${id}`;
  const values = { name: authorName || "", title };

  if (mentioned.length > 0) {
    await notify({ userIds: mentioned, type: "mention", titleKey: "taskMentionTitle", bodyKey: "taskMentionBody", values, link });
  }
  const others = [...audience].filter((u) => !mentionedSet.has(u));
  if (others.length > 0) {
    await notify({ userIds: others, type: "task_comment", titleKey: "taskCommentTitle", bodyKey: "taskCommentBody", values, link });
  }

  return NextResponse.json(
    { id: comment.id, taskId: id, userId: comment.userId, authorName: comment.authorName, body: comment.body, createdAt: comment.createdAt, user: cUser },
    { status: 201 },
  );
});

// DELETE /api/tasks/[id]/comments?commentId=... — author or admin only.
export const DELETE = withRoute("tasks.comments.delete", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const commentId = new URL(req.url).searchParams.get("commentId");
  if (!commentId) return jsonError("commentId required", 400);

  const comment = await prisma.rowComment.findUnique({ where: { id: commentId }, select: { rowId: true, userId: true } });
  if (!comment || comment.rowId !== id) return jsonError("not_found", 404);
  if (session.user.role !== "admin" && comment.userId !== session.user.id) return jsonError("forbidden", 403);

  await prisma.rowComment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
});
