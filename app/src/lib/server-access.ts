/**
 * Access control for the Servers / Remote Access pillar (§15). Mirrors lib/access.ts:
 * a server connection is visible/connectable iff the caller is an admin OR has an
 * explicit per-user grant OR is a member of a granted department (ServerAccess).
 * There are no org-wide servers in v1 — access is always an explicit grant.
 */
import { prisma } from './prisma';
import { userDepartmentIds } from './access';

/** May this user connect to / view this server connection? */
export async function userCanAccessServer(
  connectionId: string,
  userId: string | null | undefined,
  role?: string | null,
): Promise<boolean> {
  if (!connectionId || !userId) return false;
  if (role === 'admin') return true;
  // P1: explicit per-user grant
  if (await prisma.serverAccess.count({ where: { connectionId, userId } })) return true;
  // P2: membership of a granted department
  const myDeptIds = await userDepartmentIds(userId);
  if (
    myDeptIds.length &&
    (await prisma.serverAccess.count({ where: { connectionId, departmentId: { in: myDeptIds } } }))
  ) {
    return true;
  }
  return false;
}

/** The set of server-connection IDs a (non-admin) user may access — explicit + via department. */
export async function accessibleServerIds(userId: string, orgId: string): Promise<string[]> {
  const myDeptIds = await userDepartmentIds(userId);
  const grants = await prisma.serverAccess.findMany({
    where: {
      connection: { orgId },
      OR: [{ userId }, ...(myDeptIds.length ? [{ departmentId: { in: myDeptIds } }] : [])],
    },
    select: { connectionId: true },
  });
  return [...new Set(grants.map((g) => g.connectionId))];
}

/** Server connections visible to a user: admin → all in org; otherwise the accessible set. */
export async function visibleServerConnections(
  userId: string,
  role: string | null | undefined,
  orgId: string,
) {
  if (role === 'admin') {
    return prisma.serverConnection.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }
  const ids = await accessibleServerIds(userId, orgId);
  if (!ids.length) return [];
  return prisma.serverConnection.findMany({
    where: { orgId, id: { in: ids } },
    orderBy: { name: 'asc' },
  });
}
