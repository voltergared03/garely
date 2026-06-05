import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import {
  provisionSystemDecisionsTable,
  getSystemDecisionsTable,
  DECISION_FIELD_SPECS,
} from '@/lib/system-decisions-table';

vi.mock('@/lib/prisma');

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
});

describe('DECISION_FIELD_SPECS', () => {
  it('is exactly text/owner/date + structural meetingId/reportId/source', () => {
    expect(DECISION_FIELD_SPECS.map((f) => f.key)).toEqual(['text', 'owner', 'date', 'meetingId', 'reportId', 'source']);
    expect(DECISION_FIELD_SPECS.map((f) => f.type)).toEqual(['longText', 'person', 'date', 'text', 'text', 'text']);
  });
});

describe('provisionSystemDecisionsTable — fresh org', () => {
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

  it('creates a hidden system "Decisions" table with 6 fields + 2 views', async () => {
    const out = await provisionSystemDecisionsTable('org-A');

    expect((prismaMock.base.create.mock.calls[0][0] as any).data).toMatchObject({ orgId: 'org-A', name: 'Decisions', visibility: 'org', createdById: null });
    expect((prismaMock.table.create.mock.calls[0][0] as any).data).toMatchObject({ baseId: 'base1', name: 'Decisions', system: true });

    expect(prismaMock.field.create).toHaveBeenCalledTimes(6);
    const fieldData = prismaMock.field.create.mock.calls.map((c) => (c[0] as any).data);
    expect(fieldData.map((d) => d.name)).toEqual(['Decision', 'Owner', 'Date', 'Meeting', 'Report', 'Source']);

    // primary field → Decision (f1)
    expect((prismaMock.table.update.mock.calls[0][0] as any).data).toEqual({ primaryFieldId: 'f1' });

    // views: only the 3 user-facing fields are visible; calendar by Date (f3)
    expect(prismaMock.view.create).toHaveBeenCalledTimes(2);
    const viewData = prismaMock.view.create.mock.calls.map((c) => (c[0] as any).data);
    expect(viewData.map((d) => d.name)).toEqual(['Grid', 'Calendar']);
    expect((viewData[0].config as any).visibleFieldIds).toEqual(['f1', 'f2', 'f3']); // text/owner/date only
    expect((viewData[1].config as any).calendarDateFieldId).toBe('f3');

    expect(out.fieldIds).toEqual({ text: 'f1', owner: 'f2', date: 'f3', meetingId: 'f4', reportId: 'f5', source: 'f6' });
    expect(out.views).toEqual({ grid: 'v1', calendar: 'v2' });
  });
});

describe('provisionSystemDecisionsTable — idempotent re-run', () => {
  it('issues no writes and returns identical ids', async () => {
    prismaMock.base.findFirst.mockResolvedValue({ id: 'base1' } as any);
    prismaMock.table.findFirst.mockResolvedValue({ id: 'tbl1', primaryFieldId: 'f1' } as any);
    prismaMock.field.findMany.mockResolvedValue([
      { id: 'f1', name: 'Decision' }, { id: 'f2', name: 'Owner' }, { id: 'f3', name: 'Date' },
      { id: 'f4', name: 'Meeting' }, { id: 'f5', name: 'Report' }, { id: 'f6', name: 'Source' },
    ] as any);
    prismaMock.view.findMany.mockResolvedValue([{ id: 'v1', name: 'Grid' }, { id: 'v2', name: 'Calendar' }] as any);

    const out = await provisionSystemDecisionsTable('org-A');
    expect(prismaMock.base.create).not.toHaveBeenCalled();
    expect(prismaMock.field.create).not.toHaveBeenCalled();
    expect(prismaMock.view.create).not.toHaveBeenCalled();
    expect(prismaMock.table.update).not.toHaveBeenCalled();
    expect(out.fieldIds.meetingId).toBe('f4');
    expect(out.views.calendar).toBe('v2');
  });
});

describe('getSystemDecisionsTable — read-only resolver', () => {
  it('returns null when the Decisions base is missing (never creates)', async () => {
    prismaMock.base.findFirst.mockResolvedValue(null as any);
    expect(await getSystemDecisionsTable('org-A')).toBeNull();
    expect(prismaMock.base.create).not.toHaveBeenCalled();
  });

  it('resolves the scaffold when fully provisioned', async () => {
    prismaMock.base.findFirst.mockResolvedValue({ id: 'base1' } as any);
    prismaMock.table.findFirst.mockResolvedValue({ id: 'tbl1', primaryFieldId: 'f1' } as any);
    prismaMock.field.findMany.mockResolvedValue([
      { id: 'f1', name: 'Decision' }, { id: 'f2', name: 'Owner' }, { id: 'f3', name: 'Date' },
      { id: 'f4', name: 'Meeting' }, { id: 'f5', name: 'Report' }, { id: 'f6', name: 'Source' },
    ] as any);
    prismaMock.view.findMany.mockResolvedValue([{ id: 'v1', name: 'Grid' }, { id: 'v2', name: 'Calendar' }] as any);
    const out = await getSystemDecisionsTable('org-A');
    expect(out!.fieldIds).toEqual({ text: 'f1', owner: 'f2', date: 'f3', meetingId: 'f4', reportId: 'f5', source: 'f6' });
  });
});
