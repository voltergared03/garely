import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { withRoute } from "@/lib/with-route";
import { userCanViewTask } from "@/lib/access";
import { jsonError } from "@/lib/http";
import { saveTaskFile, MAX_FILE_SIZE } from "@/lib/task-files";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function serialize<T extends { fileSize: bigint | null }>(a: T) {
  return { ...a, fileSize: a.fileSize == null ? null : Number(a.fileSize) };
}

// GET /api/tasks/[id]/attachments — list (view-gated).
export const GET = withRoute("tasks.attachments.list", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const rows = await prisma.taskAttachment.findMany({
    where: { taskId: id },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows.map(serialize));
});

// POST /api/tasks/[id]/attachments — upload (multipart/form-data, field "file").
export const POST = withRoute("tasks.attachments.upload", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const task = await prisma.meetingTask.findUnique({ where: { id }, select: { id: true } });
  if (!task) return jsonError("not_found", 404);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return jsonError("no_file", 400);
  if (file.size > MAX_FILE_SIZE) return jsonError("file_too_large", 413);

  const { filePath, fileSize } = await saveTaskFile(id, file);
  const row = await prisma.taskAttachment.create({
    data: {
      taskId: id,
      fileName: file.name || "file",
      filePath,
      mimeType: file.type || null,
      fileSize: BigInt(fileSize),
      uploadedById: session.user.id,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });
  return NextResponse.json(serialize(row), { status: 201 });
});
