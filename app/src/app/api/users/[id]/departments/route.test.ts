import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';

vi.mock('@/lib/prisma');
vi.mock('@/lib/api-auth', () => ({ requireAdmin: vi.fn(async () => ({ user: { id: 'admin1', role: 'admin' } })) }));

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
});

const put = async (body: unknown) => {
  const { PUT } = await import('./route');
  return PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) as any,
    { params: Promise.resolve({ id: 'u1' }) } as any);
};

describe('PUT /api/users/[id]/departments', () => {
  it('sets the full list: drops the ones not named, adds the missing ones, keeps existing (and their lead flag)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
    prismaMock.department.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }] as any);
    prismaMock.departmentMember.deleteMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.departmentMember.createMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.departmentMember.findMany.mockResolvedValue([
      { isLead: true, department: { id: 'd2', name: 'Sales', color: null } },
      { isLead: false, department: { id: 'd1', name: 'IT', color: '#123456' } },
    ] as any);

    const res = await put({ departmentIds: ['d1', 'd2', 'd2'] });

    expect(res.status).toBe(200);
    expect(prismaMock.departmentMember.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', departmentId: { notIn: ['d1', 'd2'] } } });
    expect(prismaMock.departmentMember.createMany).toHaveBeenCalledWith({
      data: [{ departmentId: 'd1', userId: 'u1' }, { departmentId: 'd2', userId: 'u1' }],
      skipDuplicates: true,
    });
    const body = await res.json();
    expect(body.departments.map((d: any) => d.name)).toEqual(['IT', 'Sales']); // name order
    expect(body.departments.find((d: any) => d.id === 'd2').isLead).toBe(true);
  });

  it('an empty list removes every membership without inserting anything', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
    prismaMock.departmentMember.deleteMany.mockResolvedValue({ count: 2 } as any);
    prismaMock.departmentMember.findMany.mockResolvedValue([] as any);
    const res = await put({ departmentIds: [] });
    expect(res.status).toBe(200);
    expect(prismaMock.department.findMany).not.toHaveBeenCalled();
    expect(prismaMock.departmentMember.createMany).not.toHaveBeenCalled();
    expect((await res.json()).departments).toEqual([]);
  });

  it('refuses an unknown department id instead of silently dropping it', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
    prismaMock.department.findMany.mockResolvedValue([{ id: 'd1' }] as any);
    const res = await put({ departmentIds: ['d1', 'ghost'] });
    expect(res.status).toBe(400);
    expect(prismaMock.departmentMember.deleteMany).not.toHaveBeenCalled();
  });

  it('404 for a user that does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as any);
    expect((await put({ departmentIds: [] })).status).toBe(404);
  });
});
