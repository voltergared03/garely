import { NextRequest } from 'next/server';
import { internalSecret } from './secret';

/**
 * Shared-secret check for internal/machine callers (the Python agent, internal
 * webhooks). Callers must send `x-internal-key: <secret>`.
 */
const SECRET = internalSecret();

export function isInternalAuthed(req: NextRequest): boolean {
  if (!SECRET) return false;
  const key = req.headers.get('x-internal-key') || '';
  if (key.length !== SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ SECRET.charCodeAt(i);
  return diff === 0;
}
