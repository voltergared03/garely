import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import {
  provisionSystemTasksTable,
  getSystemTasksTable,
  TASK_FIELD_SPECS,
  TASK_STATUS_CHOICE_IDS,
  TASK_PRIORITY_CHOICE_IDS,
} from '@/lib/system-tasks-table';

vi.mock('@/lib/prisma');

beforeEach(() => {
  mockReset(prismaMock);
  // Run the provisioning transaction against the same mock client.
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
});

describe('TASK_FIELD_SPECS — pinned choice ids (backfill contract)', () => {
  it('status/priority choice ids equal the literal MeetingTask values', () => {
    const status = TASK_FIELD_SPECS.find((f) => f.key === 'status')!;
    const priority = TASK_FIELD_SPECS.find((f) => f.key === 'priority')!;
    expect((status.options as any).choices.map((c: any) => c.id)).toEqual(['open', 'in_progress', 'done']);
    expect((priority.options as any).choices.map((c: any) => c.id)).toEqual(['high', 'medium', 'low']);
    // and they match the exported constants the migration relies on
    expect([...TASK_STATUS_CHOICE_IDS]).toEqual(['open', 'in_progress', 'done']);
    expect([...TASK_PRIORITY_CHOICE_IDS]).toEqual(['high', 'medium', 'low']);
  });

  it('field set is exactly title/description/status/priority/dueDate/assignee in order', () => {
    expect(TASK_FIELD_SPECS.map((f) => f.key)).toEqual([
      'title', 'description', 'status', 'priority', 'dueDate', 'assignee',
    ]);
    expect(TASK_FIELD_SPECS.map((f) => f.type)).toEqual([
      'text', 'longText', 'singleSelect', 'singleSelect', 'date', 'person',
    ]);
  });
});

describe('provisionSystemTasksTable — fresh org', () => {
  beforeEach(() => {
    prismaMock.base.findFirst.mockResolvedValue(null as any);
    prismaMock.base.count.mockResolvedValue(0 as any);
    prismaMock.base.create.mockResolvedValue({ id: 'base1' } as any);
    prismaMock.table.findFirst.mockResolvedValue(null as any);
    prismaMock.table.count.mockResolvedValue(0 as any);
    prismaMock.table.create.mockResolvedValue({ id: 'tbl1', primaryFieldId: null } as any);
    prismaMock.table.update.mockResolvedValue({ id: 'tbl1' } as any);
    prismaMock.field.findMany.mockResolvedValue([] as any);
    prismaMock.field.count.mockResolvedValue(0 as any);
    let fc = 0;
    prismaMock.field.create.mockImplementation(async () => ({ id: `f${++fc}` }) as any);
    prismaMock.view.findMany.mockResolvedValue([] as any);
    prismaMock.view.count.mockResolvedValue(0 as any);
    let vc = 0;
    prismaMock.view.create.mockImplementation(async () => ({ id: `v${++vc}` }) as any);
  });

  it('creates the base, system table, 6 fields, and 3 views', async () => {
    const out = await provisionSystemTasksTable('org-A');

    expect(prismaMock.base.create).toHaveBeenCalledTimes(1);
    expect((prismaMock.base.create.mock.calls[0][0] as any).data).toMatchObject({
      orgId: 'org-A', name: 'Tasks', visibility: 'org', createdById: null,
    });
    expect((prismaMock.table.create.mock.calls[0][0] as any).data).toMatchObject({
      baseId: 'base1', name: 'Tasks', system: true,
    });

    // 6 fields, correct names + types
    expect(prismaMock.field.create).toHaveBeenCalledTimes(6);
    const fieldData = prismaMock.field.create.mock.calls.map((c) => (c[0] as any).data);
    expect(fieldData.map((d) => d.name)).toEqual([
      'Title', 'Description', 'Status', 'Priority', 'Due date', 'Assignee',
    ]);
    // Status options carry the pinned ids
    const statusData = fieldData.find((d) => d.name === 'Status');
    expect((statusData.options as any).choices.map((c: any) => c.id)).toEqual(['open', 'in_progress', 'done']);
    // text/longText fields carry NO options key
    expect('options' in fieldData[0]).toBe(false);

    // primary field → Title (f1)
    expect((prismaMock.table.update.mock.calls[0][0] as any).data).toEqual({ primaryFieldId: 'f1' });
    expect(out.table.primaryFieldId).toBe('f1');

    // views: Grid, Board(kanban→status f3), Calendar(→dueDate f5)
    expect(prismaMock.view.create).toHaveBeenCalledTimes(3);
    const viewData = prismaMock.view.create.mock.calls.map((c) => (c[0] as any).data);
    expect(viewData.map((d) => d.name)).toEqual(['Grid', 'Board', 'Calendar']);
    expect((viewData[1].config as any).kanbanStackFieldId).toBe('f3');
    expect((viewData[2].config as any).calendarDateFieldId).toBe('f5');
    expect((viewData[0].config as any).visibleFieldIds).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);

    expect(out.fieldIds).toEqual({
      title: 'f1', description: 'f2', status: 'f3', priority: 'f4', dueDate: 'f5', assignee: 'f6',
    });
    expect(out.views).toEqual({ grid: 'v1', board: 'v2', calendar: 'v3' });
  });
});

describe('provisionSystemTasksTable — idempotent re-run (everything exists)', () => {
  beforeEach(() => {
    prismaMock.base.findFirst.mockResolvedValue({ id: 'base1' } as any);
    prismaMock.table.findFirst.mockResolvedValue({ id: 'tbl1', primaryFieldId: 'f1' } as any);
    prismaMock.field.findMany.mockResolvedValue([
      { id: 'f1', name: 'Title' }, { id: 'f2', name: 'Description' },
      { id: 'f3', name: 'Status' }, { id: 'f4', name: 'Priority' },
      { id: 'f5', name: 'Due date' }, { id: 'f6', name: 'Assignee' },
    ] as any);
    prismaMock.view.findMany.mockResolvedValue([
      { id: 'v1', name: 'Grid' }, { id: 'v2', name: 'Board' }, { id: 'v3', name: 'Calendar' },
    ] as any);
  });

  it('issues no writes and returns identical ids', async () => {
    const out = await provisionSystemTasksTable('org-A');
    expect(prismaMock.base.create).not.toHaveBeenCalled();
    expect(prismaMock.table.create).not.toHaveBeenCalled();
    expect(prismaMock.field.create).not.toHaveBeenCalled();
    expect(prismaMock.view.create).not.toHaveBeenCalled();
    expect(prismaMock.table.update).not.toHaveBeenCalled(); // primaryFieldId already Title
    expect(out.fieldIds.status).toBe('f3');
    expect(out.views.board).toBe('v2');
    expect(out.table.primaryFieldId).toBe('f1');
  });
});

describe('getSystemTasksTable — read-only resolver', () => {
  it('returns null when the Tasks base is missing (never creates)', async () => {
    prismaMock.base.findFirst.mockResolvedValue(null as any);
    expect(await getSystemTasksTable('org-A')).toBeNull();
    expect(prismaMock.base.create).not.toHaveBeenCalled();
  });

  it('returns null when a standard field is missing (incomplete scaffold)', async () => {
    prismaMock.base.findFirst.mockResolvedValue({ id: 'base1' } as any);
    prismaMock.table.findFirst.mockResolvedValue({ id: 'tbl1', primaryFieldId: 'f1' } as any);
    prismaMock.field.findMany.mockResolvedValue([{ id: 'f1', name: 'Title' }] as any); // missing the rest
    expect(await getSystemTasksTable('org-A')).toBeNull();
  });

  it('resolves the scaffold when fully provisioned', async () => {
    prismaMock.base.findFirst.mockResolvedValue({ id: 'base1' } as any);
    prismaMock.table.findFirst.mockResolvedValue({ id: 'tbl1', primaryFieldId: 'f1' } as any);
    prismaMock.field.findMany.mockResolvedValue([
      { id: 'f1', name: 'Title' }, { id: 'f2', name: 'Description' },
      { id: 'f3', name: 'Status' }, { id: 'f4', name: 'Priority' },
      { id: 'f5', name: 'Due date' }, { id: 'f6', name: 'Assignee' },
    ] as any);
    prismaMock.view.findMany.mockResolvedValue([
      { id: 'v1', name: 'Grid' }, { id: 'v2', name: 'Board' }, { id: 'v3', name: 'Calendar' },
    ] as any);
    const out = await getSystemTasksTable('org-A');
    expect(out).not.toBeNull();
    expect(out!.fieldIds).toEqual({
      title: 'f1', description: 'f2', status: 'f3', priority: 'f4', dueDate: 'f5', assignee: 'f6',
    });
    expect(out!.views).toEqual({ grid: 'v1', board: 'v2', calendar: 'v3' });
  });
});
