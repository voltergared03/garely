import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { listDecisions, assembleDecisionDTO, countDecisions, decisionMutationAllowed, updateDecisionRow } from '@/lib/decisions';
import { getCurrentOrgId } from '@/lib/org';
import { mockSession } from '@/test/helpers';

const PROV = {
  base: { id: 'b1' },
  table: { id: 'dtbl', primaryFieldId: 'fText' },
  fieldIds: { text: 'fText', owner: 'fOwner', date: 'fDate', meetingId: 'fMeet', reportId: 'fRep', source: 'fSrc' },
  views: { grid: 'v1', calendar: 'v2' },
};

vi.mock('@/lib/prisma');
vi.mock('@/lib/system-decisions-table', () => ({
  getSystemDecisionsTable: vi.fn(async () => PROV),
}));
vi.mock('@/lib/org', () => ({ getCurrentOrgId: vi.fn(async () => 'org-A') }));

// Three decisions: d1 (owner u1, meeting m1), d2 (no owner, meeting m2),
// d3 (owner u2, meeting m3 — a meeting the member can't access).
const ROWS = [
  { id: 'd3', createdAt: new Date('2026-06-03'), data: { fText: 'Use Postgres', fOwner: 'u2', fMeet: 'm3', fSrc: 'ai' } },
  { id: 'd2', createdAt: new Date('2026-06-02'), data: { fText: 'Drop Teable, build native engine', fMeet: 'm2', fRep: 'r2', fSrc: 'ai' } },
  { id: 'd1', createdAt: new Date('2026-06-01'), data: { fText: 'Ship v1 in June', fOwner: 'u1', fDate: '2026-06-01T00:00:00.000Z', fMeet: 'm1', fRep: 'r1', fSrc: 'ai' } },
];
const USERS = [
  { id: 'u1', name: 'Alice', image: null },
  { id: 'u2', name: 'Bob', image: 'b.png' },
];
const MEETINGS = [
  { id: 'm1', title: 'Kickoff', scheduledAt: new Date('2026-06-01'), createdById: 'mem1' },
  { id: 'm2', title: 'Planning', scheduledAt: null, createdById: 'admin1' },
  { id: 'm3', title: 'Private 1:1', scheduledAt: null, createdById: 'u-other' },
];
const ACCESSIBLE = [{ id: 'm1' }, { id: 'm2' }]; // member can access m1, m2 — NOT m3

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(getCurrentOrgId).mockResolvedValue('org-A');
  prismaMock.row.findMany.mockResolvedValue([...ROWS] as any);
  prismaMock.row.count.mockResolvedValue(3 as any);
  prismaMock.user.findMany.mockImplementation(async (args: any) => {
    const ids: string[] = args?.where?.id?.in ?? [];
    return USERS.filter((u) => ids.includes(u.id)) as any;
  });
  prismaMock.meeting.findMany.mockImplementation(async (args: any) => {
    if (args?.where?.id?.in) {
      const ids: string[] = args.where.id.in;
      return MEETINGS.filter((m) => ids.includes(m.id)) as any;
    }
    // the member-path "accessible meetings" query (where: { OR: [...] })
    return ACCESSIBLE as any;
  });
});

describe('listDecisions — admin', () => {
  it('returns ALL decisions in the org table, newest first, fully assembled', async () => {
    const session = mockSession({ id: 'admin1', role: 'admin' });
    const out = await listDecisions(session);
    expect(out.map((d) => d.id)).toEqual(['d3', 'd2', 'd1']); // findMany already orders desc
    // the accessible-meeting query is NOT run for admins
    const accessibleCalls = prismaMock.meeting.findMany.mock.calls.filter((c) => (c[0] as any)?.where?.OR);
    expect(accessibleCalls.length).toBe(0);
    // owner + meeting resolution
    const d1 = out.find((d) => d.id === 'd1')!;
    expect(d1.owner).toMatchObject({ id: 'u1', name: 'Alice' });
    expect(d1.meeting).toMatchObject({ id: 'm1', title: 'Kickoff' });
    expect(d1.date).toBe('2026-06-01T00:00:00.000Z');
    expect(d1.text).toBe('Ship v1 in June');
    const d2 = out.find((d) => d.id === 'd2')!;
    expect(d2.owner).toBeNull();
    expect(d2.ownerId).toBeNull();
    // admins can edit every decision
    expect(out.every((d) => d.canEdit)).toBe(true);
  });
});

describe('listDecisions — per-decision authz (member)', () => {
  it('keeps only decisions whose source meeting the member can access', async () => {
    const session = mockSession({ id: 'mem1', role: 'member' });
    const out = await listDecisions(session);
    // d3 (meeting m3, inaccessible) is filtered out; d1/d2 remain
    expect(out.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
    expect(out.find((d) => d.id === 'd3')).toBeUndefined();
    // canEdit only for decisions whose meeting THIS member created (m1 → mem1)
    expect(out.find((d) => d.id === 'd1')!.canEdit).toBe(true); // m1.createdById === mem1
    expect(out.find((d) => d.id === 'd2')!.canEdit).toBe(false); // m2.createdById === admin1
  });

  it('hides decisions whose meeting is missing from the accessible set (orphaned/deleted)', async () => {
    prismaMock.meeting.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.id?.in) return [] as any; // batch lookup finds nothing
      return [] as any; // member can access NO meetings
    });
    const out = await listDecisions(mockSession({ id: 'mem1', role: 'member' }));
    expect(out).toEqual([]);
  });
});

describe('listDecisions — filters', () => {
  it('filters by meetingId (within the accessible set)', async () => {
    const out = await listDecisions(mockSession({ id: 'mem1', role: 'member' }), { meetingId: 'm1' });
    expect(out.map((d) => d.id)).toEqual(['d1']);
  });

  it('filters by owner userId', async () => {
    const out = await listDecisions(mockSession({ id: 'admin1', role: 'admin' }), { owner: 'u2' });
    expect(out.map((d) => d.id)).toEqual(['d3']);
  });

  it('filters by case-insensitive text query', async () => {
    const out = await listDecisions(mockSession({ id: 'admin1', role: 'admin' }), { q: 'teable' });
    expect(out.map((d) => d.id)).toEqual(['d2']);
  });
});

describe('listDecisions — unprovisioned / no org', () => {
  it('returns [] when the org has no Decisions table yet', async () => {
    const { getSystemDecisionsTable } = await import('@/lib/system-decisions-table');
    vi.mocked(getSystemDecisionsTable).mockResolvedValueOnce(null as any);
    expect(await listDecisions(mockSession({ role: 'admin' }))).toEqual([]);
  });
});

describe('assembleDecisionDTO — pure projector', () => {
  const df = PROV.fieldIds;
  it('resolves owner/meeting from the batched maps and defaults source to ai', () => {
    const owners = new Map([['u1', { id: 'u1', name: 'Alice', image: null }]]);
    const meetings = new Map([['m1', { id: 'm1', title: 'Kickoff', scheduledAt: new Date('2026-06-01') }]]);
    const dto = assembleDecisionDTO(
      { id: 'd1', createdAt: new Date('2026-06-01'), data: { [df.text]: 'X', [df.owner]: 'u1', [df.meetingId]: 'm1' } } as any,
      df as any, owners as any, meetings as any,
    );
    expect(dto).toMatchObject({ id: 'd1', text: 'X', ownerId: 'u1', source: 'ai' });
    expect(dto.owner).toMatchObject({ id: 'u1' });
    expect(dto.meeting).toMatchObject({ id: 'm1', title: 'Kickoff' });
  });

  it('handles an owner stored as a single-element array (defensive)', () => {
    const owners = new Map([['u9', { id: 'u9', name: 'Z', image: null }]]);
    const dto = assembleDecisionDTO(
      { id: 'd', createdAt: new Date(), data: { [df.text]: 'Y', [df.owner]: ['u9'] } } as any,
      df as any, owners as any, new Map() as any,
    );
    expect(dto.ownerId).toBe('u9');
    expect(dto.meeting).toBeNull();
  });
});

describe('countDecisions', () => {
  it('counts rows in the org Decisions table', async () => {
    expect(await countDecisions('org-A')).toBe(3);
    expect(await countDecisions(null)).toBe(0);
  });
});

describe('decisionMutationAllowed — admin OR meeting creator', () => {
  it('always allows admins (no meeting lookup)', async () => {
    expect(await decisionMutationAllowed('m1', 'anyone', 'admin')).toBe(true);
    expect(prismaMock.meeting.findUnique).not.toHaveBeenCalled();
  });
  it('allows the source meeting creator, denies others', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({ createdById: 'creator1' } as any);
    expect(await decisionMutationAllowed('m1', 'creator1', 'member')).toBe(true);
    expect(await decisionMutationAllowed('m1', 'someone-else', 'member')).toBe(false);
  });
  it('denies when there is no meeting', async () => {
    expect(await decisionMutationAllowed(null, 'u1', 'member')).toBe(false);
  });
});

describe('updateDecisionRow — merges text + owner into Row.data', () => {
  const ctx = {
    id: 'd1',
    data: { fText: 'old', fOwner: 'u1', fMeet: 'm1', fSrc: 'ai' },
    tableId: 'dtbl',
    df: PROV.fieldIds,
    orgId: 'org-A',
    meetingId: 'm1',
    fields: [
      { id: 'fText', type: 'longText', options: null },
      { id: 'fOwner', type: 'person', options: { multiple: false } },
    ],
  } as any;

  it('updates text and reassigns the owner', async () => {
    prismaMock.row.update.mockResolvedValue({} as any);
    const out = await updateDecisionRow(ctx, { text: 'new text', ownerId: 'u2' });
    expect(out).toEqual({ id: 'd1', text: 'new text', ownerId: 'u2' });
    const written = (prismaMock.row.update.mock.calls[0][0] as any).data.data;
    expect(written.fText).toBe('new text');
    expect(written.fOwner).toBe('u2'); // person(single) stores a bare id, structural cells preserved
    expect(written.fMeet).toBe('m1');
  });

  it('clears the owner when ownerId is null', async () => {
    prismaMock.row.update.mockResolvedValue({} as any);
    const out = await updateDecisionRow(ctx, { ownerId: null });
    expect(out.ownerId).toBeNull();
    const written = (prismaMock.row.update.mock.calls[0][0] as any).data.data;
    expect('fOwner' in written).toBe(false);
    expect(written.fText).toBe('old'); // unchanged
  });
});
