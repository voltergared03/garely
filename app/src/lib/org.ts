import type { Session } from 'next-auth';
import { prisma } from './prisma';

// Phase-1 multi-tenancy resolver.
// Self-host = exactly one Organization ("org #1"); every request resolves to it.
// The active org rides in the JWT (session.user.orgId). When that's absent — an
// old JWT minted before orgId existed, or a no-session context (cron / webhook /
// public token route) — we fall back to the singleton org. Cached at module scope
// to avoid a DB hit per request. (Hosted/multi-org later: the session.orgId path
// takes over; this singleton cache is only the single-tenant fallback.)
let cachedSingletonOrgId: string | null = null;

/** The singleton organization id (self-host). Cached after first lookup. */
export async function getSingletonOrgId(): Promise<string | null> {
  if (cachedSingletonOrgId) return cachedSingletonOrgId;
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  cachedSingletonOrgId = org?.id ?? null;
  return cachedSingletonOrgId;
}

/** The active org for the current request: the session's org, else the singleton. */
export async function getCurrentOrgId(session?: Session | null): Promise<string | null> {
  const fromSession = session?.user?.orgId;
  if (fromSession) return fromSession;
  return getSingletonOrgId();
}
