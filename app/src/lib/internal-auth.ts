import { NextRequest } from 'next/server';

/**
 * Shared-secret check for internal/machine callers (the Python agent, internal
 * webhooks). Callers must send `x-internal-key: <secret>`. The secret is
 * INTERNAL_API_SECRET if set, otherwise NEXTAUTH_SECRET / AUTH_SECRET — both the
 * app and the agent container receive these via env_file, so no extra config.
 */
const SECRET =
  process.env.INTERNAL_API_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  '';

export function isInternalAuthed(req: NextRequest): boolean {
  if (!SECRET) return false;
  const key = req.headers.get('x-internal-key') || '';
  if (key.length !== SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ SECRET.charCodeAt(i);
  return diff === 0;
}
