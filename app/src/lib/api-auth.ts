import type { Session } from 'next-auth';
import { auth } from './auth';
import { userCanAccessMeeting } from './access';
import { jsonError } from './http';

// Shared route guards. Routes currently copy-paste `const session = await auth();
// if (!session?.user) return 401` (~44 files), role checks (~19 files), and
// meeting-access logic (re-implemented inline despite lib/access.ts existing).
//
// Usage in a route handler:
//   const session = await requireAuth();
//   if (session instanceof Response) return session;
//   // session is fully typed here
//
// Adopt incrementally — each migrated route should gain a test (Phase 2).

/** Require any authenticated user. Returns the session, or a 401 response. */
export async function requireAuth(): Promise<Session | Response> {
  const session = await auth();
  if (!session?.user) return jsonError('unauthorized', 401);
  return session;
}

/** Require an admin. Returns the session, or a 401 / 403 response. */
export async function requireAdmin(): Promise<Session | Response> {
  const session = await auth();
  if (!session?.user) return jsonError('unauthorized', 401);
  if (session.user.role !== 'admin') return jsonError('forbidden', 403);
  return session;
}

/**
 * Require access to a meeting (admin, creator, or participant). Returns the
 * session, or a 401 / 403 response.
 */
export async function requireMeetingAccess(meetingId: string): Promise<Session | Response> {
  const session = await auth();
  if (!session?.user) return jsonError('unauthorized', 401);
  const ok = await userCanAccessMeeting(meetingId, session.user.id, session.user.role);
  if (!ok) return jsonError('forbidden', 403);
  return session;
}
