import { prisma } from './prisma';

export type UserDepartment = { id: string; name: string; color: string | null; isLead: boolean };

/** The departments a user belongs to, in name order — the shape the Users list shows. */
export async function departmentsOfUser(userId: string): Promise<UserDepartment[]> {
  const rows = await prisma.departmentMember.findMany({
    where: { userId },
    select: { isLead: true, department: { select: { id: true, name: true, color: true } } },
  });
  return rows
    .map((r) => ({ id: r.department.id, name: r.department.name, color: r.department.color, isLead: r.isLead }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Add a freshly created / invited user to departments chosen on the invite form.
 * Unknown ids are ignored rather than failing the invite — the account matters more
 * than a stale option in a form someone left open. Returns how many were attached.
 */
export async function attachDepartments(userId: string, departmentIds: unknown): Promise<number> {
  const wanted = [...new Set((Array.isArray(departmentIds) ? departmentIds : []).filter((x): x is string => typeof x === 'string' && x.trim().length > 0))];
  if (!wanted.length) return 0;
  const known = await prisma.department.findMany({ where: { id: { in: wanted } }, select: { id: true } });
  if (!known.length) return 0;
  const { count } = await prisma.departmentMember.createMany({
    data: known.map((d) => ({ departmentId: d.id, userId })),
    skipDuplicates: true,
  });
  return count;
}
