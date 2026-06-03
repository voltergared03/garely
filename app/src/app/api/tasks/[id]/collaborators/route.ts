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

const postSchema = z.object({ userId: z.string().trim().min(1) });

// GET /api/tasks/[id]/collaborators — list (view-gated).
export const GET = withRoute("tasks.collaborators.list", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const rows = await prisma.taskCollaborator.findMany({
    where: { taskId: id },
    include: { user: userSel },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(rows);
});

// POST /api/tasks/[id]/collaborators — add a collaborator + notify them.
export const POST = withRoute("tasks.collaborators.add", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError("invalid_body", 400);

  const task = await prisma.meetingTask.findUnique({ where: { id }, select: { title: true } });
  if (!task) return jsonError("not_found", 404);

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!user) return jsonError("user_not_found", 404);

  const row = await prisma.taskCollaborator.upsert({
    where: { taskId_userId: { taskId: id, userId: parsed.data.userId } },
    create: { taskId: id, userId: parsed.data.userId },
    update: {},
    include: { user: userSel },
  });

  if (parsed.data.userId !== session.user.id) {
    await notify({
      userIds: [parsed.data.userId],
      type: "task_collaborator",
      titleKey: "taskCollaboratorTitle",
      bodyKey: "taskCollaboratorBody",
      values: { name: session.user.name || "", title: task.title },
      link: `/tasks?task=${id}`,
    });
  }
  return NextResponse.json(row, { status: 201 });
});

// DELETE /api/tasks/[id]/collaborators?userId=... — remove a collaborator.
export const DELETE = withRoute("tasks.collaborators.remove", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return jsonError("userId required", 400);
  await prisma.taskCollaborator.deleteMany({ where: { taskId: id, userId } });
  return NextResponse.json({ ok: true });
});
