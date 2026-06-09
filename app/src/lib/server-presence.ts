import { prisma } from './prisma';

// A live RDP session heartbeats every ~30s; we treat it as "in use" only while that
// heartbeat is fresh, so a crashed tab / dropped connection stops showing as occupied
// after a few missed beats (instead of lingering forever on a stale audit row).
export const PRESENCE_STALE_MS = 90_000;

export interface ActiveServerSession {
  userId: string;
  name: string | null;
  startedAt: string; // ISO
  isSelf: boolean;
}

// For the given connection ids, return the currently-live sessions per connection
// (fresh heartbeat, not ended), with the occupant's display name and whether it's the
// caller themselves. Single batched query + one user lookup — safe for list rendering.
export async function activeSessionsByConnection(
  connectionIds: string[],
  callerUserId: string,
): Promise<Record<string, ActiveServerSession[]>> {
  const out: Record<string, ActiveServerSession[]> = {};
  if (connectionIds.length === 0) return out;

  const fresh = new Date(Date.now() - PRESENCE_STALE_MS);
  const rows = await prisma.serverSession.findMany({
    where: {
      connectionId: { in: connectionIds },
      status: 'active',
      endedAt: null,
      // Live if it heartbeated recently. Rows created before heartbeats existed (or in
      // the first seconds before the first beat) fall back to a fresh startedAt.
      OR: [{ lastSeenAt: { gte: fresh } }, { lastSeenAt: null, startedAt: { gte: fresh } }],
    },
    select: { connectionId: true, userId: true, startedAt: true },
    orderBy: { startedAt: 'asc' },
  });
  if (rows.length === 0) return out;

  const userIds = [...new Set(rows.map((s) => s.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  for (const s of rows) {
    (out[s.connectionId] ??= []).push({
      userId: s.userId,
      name: nameById.get(s.userId) ?? null,
      startedAt: s.startedAt.toISOString(),
      isSelf: s.userId === callerUserId,
    });
  }
  return out;
}
