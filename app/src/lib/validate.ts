import { z } from 'zod';
import { jsonError } from './http';

/**
 * Parse + validate a JSON request body against a zod schema. Returns the typed
 * data, or a ready-to-return 400 describing the first issue. Replaces ad-hoc
 * `String(body.x || '').trim()` validation with declarative schemas.
 *
 *   const v = await validateBody(req, schema);
 *   if (!v.ok) return v.response;
 *   const { ... } = v.data; // fully typed
 */
export async function validateBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError('invalid_json', 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') || 'body';
    return { ok: false, response: jsonError(`${where}: ${issue?.message ?? 'invalid'}`, 400) };
  }
  return { ok: true, data: parsed.data };
}
