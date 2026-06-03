import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { withRoute } from "@/lib/with-route";
import { userCanViewTask } from "@/lib/access";
import { jsonError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };
const userSel = { select: { id: true, name: true, image: true } };

// GET /api/tasks/[id] — full task detail for the modal: subtasks, comments,
// attachments and collaborators in a single fetch. View-gated.
export const GET = withRoute("tasks.detail", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  if (!(await userCanViewTask(id, session.user.id, session.user.role))) {
    return jsonError("forbidden", 403);
  }

  const task = await prisma.meetingTask.findUnique({
    where: { id },
    include: {
      assignee: userSel,
      meeting: { select: { id: true, title: true, scheduledAt: true } },
      department: { select: { id: true, name: true, color: true } },
      parent: { select: { id: true, title: true } },
      subtasks: {
        include: { assignee: userSel },
        orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      },
      collaborators: { include: { user: userSel }, orderBy: { createdAt: "asc" } },
      comments: { include: { user: userSel }, orderBy: { createdAt: "asc" } },
      attachments: {
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!task) return jsonError("not_found", 404);

  // BigInt (attachment.fileSize) is not JSON-serializable — coerce to number.
  const serialized = {
    ...task,
    attachments: task.attachments.map((a) => ({
      ...a,
      fileSize: a.fileSize == null ? null : Number(a.fileSize),
    })),
  };
  return NextResponse.json(serialized);
});
