import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { attachDepartments, departmentsOfUser } from './departments';

vi.mock('@/lib/prisma');
beforeEach(() => { mockReset(prismaMock); });

describe('attachDepartments', () => {
  it('attaches only departments that exist, once each, and never fails the caller', async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: 'd1' }] as any);
    prismaMock.departmentMember.createMany.mockResolvedValue({ count: 1 } as any);
    expect(await attachDepartments('u1', ['d1', 'd1', 'ghost', 42, ''])).toBe(1);
    expect(prismaMock.department.findMany).toHaveBeenCalledWith({ where: { id: { in: ['d1', 'ghost'] } }, select: { id: true } });
    expect(prismaMock.departmentMember.createMany).toHaveBeenCalledWith({ data: [{ departmentId: 'd1', userId: 'u1' }], skipDuplicates: true });
  });
  it('does nothing for an empty or non-array value', async () => {
    expect(await attachDepartments('u1', undefined)).toBe(0);
    expect(await attachDepartments('u1', [])).toBe(0);
    expect(prismaMock.department.findMany).not.toHaveBeenCalled();
  });
});

describe('departmentsOfUser', () => {
  it('returns name-ordered departments with the lead flag', async () => {
    prismaMock.departmentMember.findMany.mockResolvedValue([
      { isLead: true, department: { id: 'd2', name: 'Sales', color: null } },
      { isLead: false, department: { id: 'd1', name: 'IT', color: '#123' } },
    ] as any);
    expect(await departmentsOfUser('u1')).toEqual([
      { id: 'd1', name: 'IT', color: '#123', isLead: false },
      { id: 'd2', name: 'Sales', color: null, isLead: true },
    ]);
  });
});
