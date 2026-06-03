/**
 * Storage for task file attachments. Files live on disk under TASK_FILES_DIR
 * (a Docker volume in production: `eam-meet-task-files` mounted at /task-files;
 * a local folder in dev). The DB stores only a relative path
 * (`<taskId>/<random>.<ext>`); bytes never touch Postgres. NODE-ONLY (fs).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const TASK_FILES_DIR = process.env.TASK_FILES_DIR || path.join(process.cwd(), '.task-files');

/** Hard cap on a single upload. Mirror this in the client for a friendly error. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Content types we're willing to echo back verbatim on download (always with an
 * `attachment` disposition + nosniff, so even these never execute inline).
 * Everything else is served as application/octet-stream.
 */
const SAFE_CONTENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

/** Keep only a short, lowercase extension; drop anything suspicious. */
function safeExt(name: string): string {
  const ext = path.extname(name || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext.length > 1 && ext.length <= 12 ? ext : '';
}

/** Persist an uploaded File under the task's folder. Returns the relative path + size. */
export async function saveTaskFile(
  taskId: string,
  file: File,
): Promise<{ filePath: string; fileSize: number }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(TASK_FILES_DIR, taskId);
  await fs.mkdir(dir, { recursive: true });
  const stored = `${randomUUID()}${safeExt(file.name)}`;
  await fs.writeFile(path.join(dir, stored), buf);
  return { filePath: path.join(taskId, stored), fileSize: buf.byteLength };
}

/**
 * Resolve a stored relative path to an absolute one, refusing anything that
 * escapes the storage root (path-traversal guard). Returns null if invalid.
 */
export function resolveTaskFile(filePath: string): string | null {
  if (!filePath) return null;
  const root = path.resolve(TASK_FILES_DIR);
  const abs = path.resolve(root, filePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/** Best-effort delete of a stored file (never throws). */
export async function deleteTaskFile(filePath: string): Promise<void> {
  const abs = resolveTaskFile(filePath);
  if (!abs) return;
  await fs.rm(abs, { force: true }).catch(() => {});
}

/** A content type that is safe to send on download (attachment disposition assumed). */
export function downloadContentType(mimeType: string | null | undefined): string {
  return mimeType && SAFE_CONTENT_TYPES.has(mimeType) ? mimeType : 'application/octet-stream';
}
