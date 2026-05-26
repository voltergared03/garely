import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanAccessMeeting, meetingIdOfTask } from "@/lib/access";

// GET /api/tasks — list tasks with filters
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, meetingId, assigneeId, priority, dueDate } = body;

  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

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

// PATCH /api/tasks — update task
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t = await getTranslations("errors");
  const { taskId, ...data } = await req.json();
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }

  // Authorization: tasks tied to a meeting require access to that meeting.
  const mId = await meetingIdOfTask(taskId);
  if (mId && !(await userCanAccessMeeting(mId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // If assigneeId is being updated, also update assigneeName
  if (data.assigneeId) {
    const assigneeUser = await prisma.user.findUnique({
      where: { id: data.assigneeId },
      select: { name: true },
    });
    if (assigneeUser) {
      data.assigneeName = assigneeUser.name;
    }
  }

  // Set completedAt when marking done
  if (data.status === "done" && !data.completedAt) {
    data.completedAt = new Date();
  }
  if (data.status && data.status !== "done") {
    data.completedAt = null;
  }

  // Convert dueDate string to Date
  if (data.dueDate && typeof data.dueDate === "string") {
    data.dueDate = new Date(data.dueDate);
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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t = await getTranslations("errors");
  const { taskId } = await req.json();
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }

  // Authorization: tasks tied to a meeting require access to that meeting.
  const mId = await meetingIdOfTask(taskId);
  if (mId && !(await userCanAccessMeeting(mId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.meetingTask.delete({ where: { id: taskId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: t("taskNotFound") }, { status: 404 });
  }
}
