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

const postSchema = z.object({ userId: z.string().trim().min(1) });

// GET /api/tasks/[id]/collaborators — list (view-gated).
export const GET = withRoute("tasks.collaborators.list", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const rows = await prisma.rowCollaborator.findMany({ where: { rowId: id }, orderBy: { createdAt: "asc" } });
  const users = await usersByIds(rows.map((r) => r.userId));
  return NextResponse.json(
    rows.map((r) => ({ id: r.id, taskId: id, userId: r.userId, createdAt: r.createdAt, user: users.get(r.userId) ?? null })),
  );
});

// POST /api/tasks/[id]/collaborators — add a collaborator + notify them.
export const POST = withRoute("tasks.collaborators.add", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError("invalid_body", 400);

  const row = await prisma.row.findUnique({ where: { id }, select: { data: true, table: { select: { base: { select: { orgId: true } } } } } });
  if (!row) return jsonError("not_found", 404);
  const prov = await getSystemTasksTable(row.table.base.orgId);
  const title = (prov ? String(((row.data ?? {}) as Record<string, unknown>)[prov.fieldIds.title] ?? "") : "") || "";

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!user) return jsonError("user_not_found", 404);

  const rc = await prisma.rowCollaborator.upsert({
    where: { rowId_userId: { rowId: id, userId: parsed.data.userId } },
    create: { rowId: id, userId: parsed.data.userId },
    update: {},
  });
  const cUser = (await usersByIds([parsed.data.userId])).get(parsed.data.userId) ?? null;

  if (parsed.data.userId !== session.user.id) {
    await notify({
      userIds: [parsed.data.userId],
      type: "task_collaborator",
      titleKey: "taskCollaboratorTitle",
      bodyKey: "taskCollaboratorBody",
      values: { name: session.user.name || "", title },
      link: `/tasks?task=${id}`,
    });
  }
  return NextResponse.json({ id: rc.id, taskId: id, userId: rc.userId, createdAt: rc.createdAt, user: cUser }, { status: 201 });
});

// DELETE /api/tasks/[id]/collaborators?userId=... — remove a collaborator.
export const DELETE = withRoute("tasks.collaborators.remove", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return jsonError("userId required", 400);
  await prisma.rowCollaborator.deleteMany({ where: { rowId: id, userId } });
  return NextResponse.json({ ok: true });
});
