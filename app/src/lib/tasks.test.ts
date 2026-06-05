import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { deleteTask, setRowAssignees } from '@/lib/tasks';

vi.mock('@/lib/prisma');
vi.mock('@/lib/system-tasks-table', () => ({
  getSystemTasksTable: vi.fn(async () => ({ fieldIds: { title: 'fT', description: 'fD', status: 'fS', priority: 'fP', dueDate: 'fU', assignee: 'fA' } })),
  provisionSystemTasksTable: vi.fn(),
}));
vi.mock('@/lib/access', () => ({ userDepartmentIds: vi.fn(async () => []), userCanAccessMeeting: vi.fn(), userCanViewTask: vi.fn() }));
vi.mock('@/lib/org', () => ({ getCurrentOrgId: vi.fn(), requireCurrentOrgId: vi.fn() }));

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
});

describe('deleteTask — explicit subtask cascade', () => {
  it('deletes subtask Rows BEFORE the parent (TaskRow.parentRowId has no FK cascade)', async () => {
    prismaMock.taskRow.findMany.mockResolvedValue([{ rowId: 's1' }, { rowId: 's2' }] as any);
    const order: string[] = [];
    prismaMock.row.deleteMany.mockImplementation(async () => { order.push('deleteMany'); return { count: 2 } as any; });
    prismaMock.row.delete.mockImplementation(async () => { order.push('delete'); return { id: 't1' } as any; });

    await deleteTask('t1');

    expect(prismaMock.row.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['s1', 's2'] } } });
    expect(prismaMock.row.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(order).toEqual(['deleteMany', 'delete']); // subtasks first, then parent
  });

  it('skips the subtask deleteMany when there are no subtasks', async () => {
    prismaMock.taskRow.findMany.mockResolvedValue([] as any);
    prismaMock.row.delete.mockResolvedValue({ id: 't1' } as any);
    await deleteTask('t1');
    expect(prismaMock.row.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.row.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });
});

describe('setRowAssignees — denorm keeper', () => {
  it('rewrites RowAssignment to the set AND mirrors the person cell (lead first)', async () => {
    prismaMock.row.findUnique
      .mockResolvedValueOnce({ table: { base: { orgId: 'org-A' } } } as any) // org lookup
      .mockResolvedValueOnce({ data: { existing: 1 } } as any); // current cell bag
    prismaMock.rowAssignment.deleteMany.mockResolvedValue({ count: 0 } as any);
    prismaMock.rowAssignment.upsert.mockResolvedValue({} as any);
    prismaMock.row.update.mockResolvedValue({} as any);

    await setRowAssignees('t1', ['u1', 'u2', 'u1']); // dedup → [u1,u2]

    expect(prismaMock.rowAssignment.deleteMany).toHaveBeenCalledWith({ where: { rowId: 't1', userId: { notIn: ['u1', 'u2'] } } });
    expect(prismaMock.rowAssignment.upsert).toHaveBeenCalledTimes(2);
    const upd = (prismaMock.row.update.mock.calls[0][0] as any).data;
    expect(upd.data.fA).toEqual(['u1', 'u2']); // person cell = assignees, lead (u1) first
    expect(upd.data.existing).toBe(1); // preserves other cells
  });

  it('clears the person cell when the set becomes empty', async () => {
    prismaMock.row.findUnique
      .mockResolvedValueOnce({ table: { base: { orgId: 'org-A' } } } as any)
      .mockResolvedValueOnce({ data: { fA: ['u1'] } } as any);
    prismaMock.rowAssignment.deleteMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.row.update.mockResolvedValue({} as any);

    await setRowAssignees('t1', []);

    // sentinel keeps deleteMany valid (removes everyone) when the set is empty
    expect(prismaMock.rowAssignment.deleteMany).toHaveBeenCalledWith({ where: { rowId: 't1', userId: { notIn: [' '] } } });
    const upd = (prismaMock.row.update.mock.calls[0][0] as any).data;
    expect('fA' in upd.data).toBe(false); // person cell cleared
  });
});
