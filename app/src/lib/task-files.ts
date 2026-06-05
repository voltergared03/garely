/**
 * Storage for record (Row) file attachments — generalized from task files
 * (Phase 3.0, roadmap §15). Files live on disk under ROW_FILES_DIR (a Docker
 * volume in production: `eam-meet-task-files` mounted at /task-files; a local
 * folder in dev). The DB stores only a relative path (`<rowId>/<random>.<ext>`);
 * bytes never touch Postgres. NODE-ONLY (fs).
 *
 * The volume is REUSED (ROW_FILES_DIR falls back to TASK_FILES_DIR), so no
 * files move: after the 3.1 same-id migration, `rowId === old taskId`, so an
 * existing `<taskId>/…` file is already addressable as `<rowId>/…`. The
 * `saveTaskFile`/`resolveTaskFile`/`deleteTaskFile` names are kept as aliases
 * (see bottom) so the pre-cutover Task* routes keep working until 3.4 cleanup.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const ROW_FILES_DIR =
  process.env.ROW_FILES_DIR || process.env.TASK_FILES_DIR || path.join(process.cwd(), '.task-files');

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

/** Persist an uploaded File under the row's folder. Returns the relative path + size. */
export async function saveRowFile(
  rowId: string,
  file: File,
): Promise<{ filePath: string; fileSize: number }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(ROW_FILES_DIR, rowId);
  await fs.mkdir(dir, { recursive: true });
  const stored = `${randomUUID()}${safeExt(file.name)}`;
  await fs.writeFile(path.join(dir, stored), buf);
  return { filePath: path.join(rowId, stored), fileSize: buf.byteLength };
}

/**
 * Resolve a stored relative path to an absolute one, refusing anything that
 * escapes the storage root (path-traversal guard). Returns null if invalid.
 */
export function resolveRowFile(filePath: string): string | null {
  if (!filePath) return null;
  const root = path.resolve(ROW_FILES_DIR);
  const abs = path.resolve(root, filePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/** Best-effort delete of a stored file (never throws). */
export async function deleteRowFile(filePath: string): Promise<void> {
  const abs = resolveRowFile(filePath);
  if (!abs) return;
  await fs.rm(abs, { force: true }).catch(() => {});
}

/** A content type that is safe to send on download (attachment disposition assumed). */
export function downloadContentType(mimeType: string | null | undefined): string {
  return mimeType && SAFE_CONTENT_TYPES.has(mimeType) ? mimeType : 'application/octet-stream';
}

// ---- Back-compat aliases (pre-3.2 cutover) --------------------------------
// The disk layout is unchanged, so task-keyed paths and row-keyed paths are the
// same folder. Existing Task* attachment routes import these names; remove the
// aliases in the 3.4 cleanup once nothing references them.
/** @deprecated use {@link saveRowFile} — identical behavior. */
export const saveTaskFile = saveRowFile;
/** @deprecated use {@link resolveRowFile} — identical behavior. */
export const resolveTaskFile = resolveRowFile;
/** @deprecated use {@link deleteRowFile} — identical behavior. */
export const deleteTaskFile = deleteRowFile;
