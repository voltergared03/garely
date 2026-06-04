/**
 * Storage for base (table) cell file attachments. Bytes live on disk under
 * BASE_FILES_DIR (a Docker volume in production: `eam-meet-base-files` mounted
 * at /base-files; a local folder in dev). The Row.data JSONB cell stores only a
 * descriptor list ({ id, name, path, mime, size }); bytes never touch Postgres.
 * Files are namespaced per base (`<baseId>/<random>.<ext>`) so the serve route
 * can refuse any stored path that doesn't belong to the base it's serving.
 * NODE-ONLY (fs).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const BASE_FILES_DIR = process.env.BASE_FILES_DIR || path.join(process.cwd(), '.base-files');

/** Hard cap on a single upload. Mirror this in the client for a friendly error. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Types we're willing to serve INLINE (preview in the browser). Everything else
 * is sent as an attachment download. SVG is deliberately excluded — it can carry
 * script, so it's only ever downloaded, never rendered inline.
 */
const INLINE_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** Keep only a short, lowercase extension; drop anything suspicious. */
function safeExt(name: string): string {
  const ext = path.extname(name || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext.length > 1 && ext.length <= 12 ? ext : '';
}

/** Persist an uploaded File under the base's folder. Returns a forward-slash relative path + size. */
export async function saveBaseFile(
  baseId: string,
  file: File,
): Promise<{ filePath: string; fileSize: number }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(BASE_FILES_DIR, baseId);
  await fs.mkdir(dir, { recursive: true });
  const stored = `${randomUUID()}${safeExt(file.name)}`;
  await fs.writeFile(path.join(dir, stored), buf);
  return { filePath: `${baseId}/${stored}`, fileSize: buf.byteLength };
}

/**
 * Resolve a stored relative path to an absolute one, refusing anything that
 * escapes the storage root (path-traversal guard). Returns null if invalid.
 */
export function resolveBaseFile(filePath: string): string | null {
  if (!filePath) return null;
  const root = path.resolve(BASE_FILES_DIR);
  const abs = path.resolve(root, filePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/** Best-effort delete of a stored file (never throws). */
export async function deleteBaseFile(filePath: string): Promise<void> {
  const abs = resolveBaseFile(filePath);
  if (!abs) return;
  await fs.rm(abs, { force: true }).catch(() => {});
}

/** Read a stored file's bytes, or null if missing/invalid. */
export async function readBaseFile(filePath: string): Promise<Buffer | null> {
  const abs = resolveBaseFile(filePath);
  if (!abs) return null;
  return fs.readFile(abs).catch(() => null);
}

/** True if the mime type is safe to render inline (image/* except svg, or pdf). */
export function canInline(mime: string | null | undefined): boolean {
  return !!mime && INLINE_CONTENT_TYPES.has(mime);
}

/** Content type to send: the real type for inline-able files, else octet-stream. */
export function serveContentType(mime: string | null | undefined): string {
  return canInline(mime) ? (mime as string) : 'application/octet-stream';
}
