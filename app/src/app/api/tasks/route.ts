import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { userCanAccessMeeting } from "@/lib/access";
import { z } from "zod";
import { validateBody } from "@/lib/validate";

const taskCreateSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullish(),
  meetingId: z.string().nullish(),
  assigneeId: z.string().nullish(),
  priority: z.string().nullish(),
  dueDate: z.string().nullish(),
});

// PATCH accepts ONLY these fields; zod strips everything else, so a client can
// never write meetingId / reportId / source / external* / completedAt directly.
const taskUpdateSchema = z.object({
  taskId: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  description: z.string().nullish(),
  status: z.string().optional(),
  priority: z.string().optional(),
  dueDate: z.string().nullish(),
  assigneeId: z.string().nullish(),
  sortOrder: z.number().int().optional(),
});

/**
 * Authorize a mutation (update/delete) of a single task. Meeting-tied tasks
 * require access to that meeting; standalone tasks (no meeting) may only be
 * mutated by their assignee or an admin. Returns a Response (403/404) when not
 * allowed, otherwise the task's ownership fields.
 */
async function authorizeTaskMutation(
  taskId: string,
  userId: string,
  role: string | null | undefined,
  t: (key: string) => string,
): Promise<{ meetingId: string | null; assigneeId: string | null } | Response> {
  const task = await prisma.meetingTask.findUnique({
    where: { id: taskId },
    select: { meetingId: true, assigneeId: true },
  });
  if (!task) return NextResponse.json({ error: t("taskNotFound") }, { status: 404 });
  if (task.meetingId) {
    if (!(await userCanAccessMeeting(task.meetingId, userId, role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (role !== "admin" && task.assigneeId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return task;
}

// GET /api/tasks — list tasks with filters
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const userId = session.user.id;
  const userRole = session.user.role;
  const isAdmin = userRole === "admin";
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "mine"; // mine | all
  const meetingId = url.searchParams.get("meetingId");
  const priority = url.searchParams.get("priority");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("q");

  const where: any = {};

  // Scope filter
  if (scope === "mine") {
    where.assigneeId = userId;
  } else if (!isAdmin) {
    where.OR = [
      { assigneeId: userId },
      { meeting: { participants: { some: { userId } } } },
      { meeting: { createdById: userId } },
    ];
  }

  if (meetingId) where.meetingId = meetingId;
  if (priority) where.priority = priority;
  if (status) where.status = status;
  if (search) {
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const tasks = await prisma.meetingTask.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, image: true } },
      meeting: { select: { id: true, title: true, scheduledAt: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(tasks);
}

// POST /api/tasks — create task manually
export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const v = await validateBody(req, taskCreateSchema);
  if (!v.ok) return v.response;
  const { title, description, meetingId, assigneeId, priority, dueDate } = v.data;

  if (meetingId) {
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
  }

  let assigneeName: string | null = null;
  if (assigneeId) {
    const user = await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } });
    assigneeName = user?.name || null;
  }

  const task = await prisma.meetingTask.create({
    data: {
      title,
      description: description || null,
      meetingId,
      assigneeId: assigneeId || null,
      assigneeName,
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      status: "open",
      source: "manual",
    },
    include: {
      assignee: { select: { id: true, name: true, image: true } },
      meeting: { select: { id: true, title: true, scheduledAt: true } },
    },
  });

  return NextResponse.json(task, { status: 201 });
}

// PATCH /api/tasks — update task (whitelisted fields only)
export async function PATCH(req: NextRequest) {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const t = await getTranslations("errors");
  const v = await validateBody(req, taskUpdateSchema);
  if (!v.ok) return v.response;
  const { taskId, ...fields } = v.data;

  const authz = await authorizeTaskMutation(taskId, session.user.id, session.user.role, t);
  if (authz instanceof Response) return authz;

  // Build the update from whitelisted fields only — never spread the raw body.
  const data: Prisma.MeetingTaskUncheckedUpdateInput = {};
  if (fields.title !== undefined) data.title = fields.title;
  if (fields.description !== undefined) data.description = fields.description ?? null;
  if (fields.priority !== undefined) data.priority = fields.priority;
  if (fields.sortOrder !== undefined) data.sortOrder = fields.sortOrder;
  if (fields.dueDate !== undefined) data.dueDate = fields.dueDate ? new Date(fields.dueDate) : null;
  if (fields.assigneeId !== undefined) {
    data.assigneeId = fields.assigneeId || null;
    if (fields.assigneeId) {
      const assigneeUser = await prisma.user.findUnique({
        where: { id: fields.assigneeId },
        select: { name: true },
      });
      data.assigneeName = assigneeUser?.name ?? null;
    } else {
      data.assigneeName = null;
    }
  }
  if (fields.status !== undefined) {
    data.status = fields.status;
    data.completedAt = fields.status === "done" ? new Date() : null;
  }

  try {
    const task = await prisma.meetingTask.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, name: true, image: true } },
        meeting: { select: { id: true, title: true, scheduledAt: true } },
      },
    });
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: t("taskNotFound") }, { status: 404 });
  }
}

// DELETE /api/tasks — delete task
export async function DELETE(req: NextRequest) {
  const session = await requireAuth();
  if (session instanceof Response) return session;

  const t = await getTranslations("errors");
  const { taskId } = await req.json();
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }

  const authz = await authorizeTaskMutation(taskId, session.user.id, session.user.role, t);
  if (authz instanceof Response) return authz;

  try {
    await prisma.meetingTask.delete({ where: { id: taskId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: t("taskNotFound") }, { status: 404 });
  }
}
