import { NextRequest, NextResponse } from "next/server";
import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { withRoute } from "@/lib/with-route";
import { userCanViewTask } from "@/lib/access";
import { jsonError } from "@/lib/http";
import { resolveTaskFile, deleteTaskFile, downloadContentType } from "@/lib/task-files";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

// GET — download the file. ALWAYS served as an attachment (never inline) with
// nosniff, so a malicious upload can't execute as HTML/script in our origin.
export const GET = withRoute("tasks.attachments.download", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id, attachmentId } = await ctx.params;
  if (!(await userCanViewTask(id, session.user.id, session.user.role))) return jsonError("forbidden", 403);

  const att = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!att || att.taskId !== id) return jsonError("not_found", 404);

  const abs = resolveTaskFile(att.filePath);
  if (!abs) return jsonError("not_found", 404);
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return jsonError("file_missing", 404);
  }

  const safeName = (att.fileName || "file").replace(/["\\\r\n]/g, "_");
  const stream = createReadStream(abs);
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: {
      "Content-Type": downloadContentType(att.mimeType),
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

// DELETE — uploader or admin only. Removes the row + the file on disk.
export const DELETE = withRoute("tasks.attachments.delete", async (_req: NextRequest, ctx: Ctx) => {
  const session = await requireAuth();
  if (session instanceof Response) return session;
  const { id, attachmentId } = await ctx.params;

  const att = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId },
    select: { taskId: true, uploadedById: true, filePath: true },
  });
  if (!att || att.taskId !== id) return jsonError("not_found", 404);
  if (session.user.role !== "admin" && att.uploadedById !== session.user.id) return jsonError("forbidden", 403);

  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
  await deleteTaskFile(att.filePath);
  return NextResponse.json({ ok: true });
});
