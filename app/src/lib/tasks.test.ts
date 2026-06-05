import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import {
  deleteTask,
  setRowAssignees,
  applyCustomCells,
  createTaskField,
  updateTaskField,
  deleteTaskField,
  listTaskFields,
} from '@/lib/tasks';
import { getCurrentOrgId } from '@/lib/org';

const PROV = {
  base: { id: 'b1' },
  table: { id: 'tbl', primaryFieldId: 'fT' },
  fieldIds: { title: 'fT', description: 'fD', status: 'fS', priority: 'fP', dueDate: 'fU', assignee: 'fA' },
  views: { grid: 'v1', board: 'v2', calendar: 'v3' },
};

vi.mock('@/lib/prisma');
vi.mock('@/lib/system-tasks-table', () => ({
  getSystemTasksTable: vi.fn(async () => PROV),
  provisionSystemTasksTable: vi.fn(async () => PROV),
}));
vi.mock('@/lib/access', () => ({ userDepartmentIds: vi.fn(async () => []), userCanAccessMeeting: vi.fn(), userCanViewTask: vi.fn() }));
vi.mock('@/lib/org', () => ({ getCurrentOrgId: vi.fn(async () => 'org-A'), requireCurrentOrgId: vi.fn() }));

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  vi.mocked(getCurrentOrgId).mockResolvedValue('org-A');
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

describe('applyCustomCells — custom-field write guard (P3.3)', () => {
  // reserved = title/desc/status/priority/dueDate/assignee field ids
  const reserved = ['fT', 'fD', 'fS', 'fP', 'fU', 'fA'];

  it('merges custom cells but REJECTS reserved (system + assignee) ids', () => {
    const patch: Record<string, unknown> = { fS: 'done' }; // a typed-field patch already set
    applyCustomCells(patch, { fX: 42, fCustom: 'ok', fA: ['evil'], fS: 'open' }, reserved);
    expect(patch.fX).toBe(42);
    expect(patch.fCustom).toBe('ok');
    expect(patch.fA).toBeUndefined();   // assignee never writable via cells (only setRowAssignees)
    expect(patch.fS).toBe('done');      // typed status preserved — cells can't clobber the one write path
  });

  it('no-ops when cells is undefined (returns the same patch object)', () => {
    const patch = { fS: 'done' };
    expect(applyCustomCells(patch, undefined, reserved)).toBe(patch);
  });
});

describe('createTaskField — custom field schema (P3.3)', () => {
  it('rejects link fields in v1', async () => {
    const r = await createTaskField('org-A', { name: 'Rel', type: 'link' as any });
    expect(r).toEqual({ error: 'unsupported_field_type', status: 400 });
    expect(prismaMock.field.create).not.toHaveBeenCalled();
  });

  it('creates a custom field on the org-resolved system table (never a client table)', async () => {
    prismaMock.field.count.mockResolvedValue(6 as any);
    prismaMock.field.create.mockResolvedValue({ id: 'fX', tableId: 'tbl', name: 'Cost', type: 'currency', options: { symbol: '₴', precision: 2 }, position: 6, width: null } as any);
    const r = await createTaskField('org-A', { name: 'Cost', type: 'currency' as any });
    expect('field' in r && r.field.id).toBe('fX');
    expect((prismaMock.field.create.mock.calls[0][0] as any).data.tableId).toBe('tbl'); // resolved from orgId
  });
});

describe('updateTaskField / deleteTaskField — scope + system-field guard (P3.3)', () => {
  it('refuses one of the 6 system field ids (403)', async () => {
    prismaMock.field.findUnique.mockResolvedValue({ tableId: 'tbl', type: 'singleSelect', options: null } as any);
    const r = await updateTaskField('org-A', 'fS', { name: 'x' }); // fS = status (system)
    expect(r).toEqual({ error: 'system_field', status: 403 });
    expect(prismaMock.field.update).not.toHaveBeenCalled();
  });

  it('refuses a field outside the org Tasks table (404)', async () => {
    prismaMock.field.findUnique.mockResolvedValue({ tableId: 'OTHER', type: 'text', options: null } as any);
    const r = await deleteTaskField('org-A', 'fForeign');
    expect(r).toEqual({ error: 'not_found', status: 404 });
    expect(prismaMock.field.delete).not.toHaveBeenCalled();
  });

  it('deletes a custom field that belongs to the Tasks table', async () => {
    prismaMock.field.findUnique.mockResolvedValue({ tableId: 'tbl', type: 'currency', options: null } as any);
    prismaMock.field.delete.mockResolvedValue({} as any);
    const r = await deleteTaskField('org-A', 'fX');
    expect(r).toEqual({ ok: true });
    expect(prismaMock.field.delete).toHaveBeenCalledWith({ where: { id: 'fX' } });
  });
});

describe('listTaskFields — client FieldT projection (P3.3)', () => {
  it('maps the system table fields and normalizes width to null', async () => {
    prismaMock.field.findMany.mockResolvedValue([
      { id: 'fT', tableId: 'tbl', name: 'Title', type: 'text', options: null, position: 0, width: 240 },
      { id: 'fX', tableId: 'tbl', name: 'Cost', type: 'currency', options: { symbol: '₴', precision: 2 }, position: 6, width: null },
    ] as any);
    const fields = await listTaskFields({ user: { id: 'u1' } } as any);
    expect(fields).toHaveLength(2);
    expect(fields[1]).toMatchObject({ id: 'fX', name: 'Cost', type: 'currency', width: null });
  });

  it('returns [] when the org has no system Tasks table', async () => {
    const { getSystemTasksTable } = await import('@/lib/system-tasks-table');
    vi.mocked(getSystemTasksTable).mockResolvedValueOnce(null as any);
    expect(await listTaskFields({ user: { id: 'u1' } } as any)).toEqual([]);
  });
});
