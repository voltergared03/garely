import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { withRoute } from "@/lib/with-route";
import { userCanViewTask } from "@/lib/access";
import { usersByIds } from "@/lib/tasks";
import { jsonError } from "@/lib/http";
import { saveTaskFile, MAX_FILE_SIZE } from "@/lib/task-files";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type Att = { id: string; fileName: string; filePath: string; mimeType: string | null; fileSize: bigint | null; uploadedById: string | null; createdAt: Date };
async function shape(atts: Att[], rowId: string) {
  const users = await usersByIds(atts.map((a) => a.uploadedById));
  return atts.map((a) => ({
    id: a.id,
    taskId: rowId,
    fileName: a.fileName,
    filePath: a.filePath,
    mimeType: a.mimeType,
    fileSize: a.fileSize == null ? null : Number(a.fileSize),
    uploadedById: a.uploadedById,
    uploadedBy: a.uploadedById ? (users.get(a.uploadedById) ? { id: a.uploadedById, name: users.get(a.uploadedById)!.name } : { id: a.uploadedById, name: null }) : null,
    createdAt: a.createdAt,
  }));
}

// GET /api/tasks/[id]/attachments — list (view-gated). Tasks are Rows now.
export const GET = withRoute("tasks.attachments.list", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const atts = await prisma.rowAttachment.findMany({ where: { rowId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(await shape(atts, id));
});

// POST /api/tasks/[id]/attachments — upload (multipart/form-data, field "file").
export const POST = withRoute("tasks.attachments.upload", async (req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const row = await prisma.row.findUnique({ where: { id }, select: { id: true } });
  if (!row) return jsonError("not_found", 404);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return jsonError("no_file", 400);
  if (file.size > MAX_FILE_SIZE) return jsonError("file_too_large", 413);

  const { filePath, fileSize } = await saveTaskFile(id, file);
  const att = await prisma.rowAttachment.create({
    data: {
      rowId: id,
      fileName: file.name || "file",
      filePath,
      mimeType: file.type || null,
      fileSize: BigInt(fileSize),
      uploadedById: session.user.id,
    },
  });
  const [shaped] = await shape([att], id);
  return NextResponse.json(shaped, { status: 201 });
});
