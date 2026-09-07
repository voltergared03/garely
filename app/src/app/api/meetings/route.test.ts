import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { GET } from './route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/lib/internal-auth', () => ({ isInternalAuthed: vi.fn(() => true) }));
vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(async () => ({})),
  num: vi.fn((cfg: Record<string, string>, k: string) => Number(cfg[k]) || 0),
}));
vi.mock('@/lib/org', () => ({
  getCurrentOrgId: vi.fn(async () => 'org1'),
  requireCurrentOrgId: vi.fn(async () => 'org1'),
}));
vi.mock('@/lib/meeting-invite', () => ({ sendMeetingInvite: vi.fn(async () => {}) }));
vi.mock('@/lib/calendar-sync', () => ({ syncMeetingToGoogle: vi.fn(async () => {}) }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (k: string) => k) }));
import { POST } from './route';
import { auth } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { jsonReq, mockSession } from '@/test/helpers';

beforeEach(() => { mockReset(prismaMock); });

describe('GET /api/meetings?livekitRoom= (the STT agent lookup)', () => {
  it('returns transcriptionEnabled — the agent gates on it, and omitting it kills the switch', async () => {
    // Regression: the select shipped without this field, so agent.py read undefined,
    // `is False` never matched, and turning transcription off did nothing at all.
    prismaMock.meeting.findMany.mockResolvedValue([
      { id: 'm1', livekitRoom: 'meet-x', status: 'live', title: 'T', transcriptionEnabled: false },
    ] as any);

    const res = await GET(new Request('http://x/api/meetings?livekitRoom=meet-x') as any);
    const body = await res.json();

    expect(body[0]).toHaveProperty('transcriptionEnabled', false);
    const select = (prismaMock.meeting.findMany.mock.calls[0][0] as any).select;
    expect(select.transcriptionEnabled).toBe(true);
  });
});


describe('POST /api/meetings — the task-creation default', () => {
  const create = () => prismaMock.meeting.create.mock.calls[0][0] as any;
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession({ id: 'u1', role: 'member' }) as any);
    prismaMock.meeting.create.mockResolvedValue({ id: 'm1', title: 'T', participants: [] } as any);
  });

  it('is OFF when the field is omitted and the workspace has no opinion', async () => {
    // It used to be `?? true` — the one default an admin could not switch off, while
    // the other three switches already deferred to the workspace policy.
    vi.mocked(readConfig).mockResolvedValue({});
    await POST(jsonReq('POST', { title: 'Sync' }));
    expect(create().data.taskCreationEnabled).toBe(false);
  });

  it('is ON when the field is omitted and the workspace policy says so', async () => {
    vi.mocked(readConfig).mockResolvedValue({ WS_TASK_CREATION: 'true' });
    await POST(jsonReq('POST', { title: 'Sync' }));
    expect(create().data.taskCreationEnabled).toBe(true);
  });

  it('an explicit value on the meeting always wins over the policy', async () => {
    vi.mocked(readConfig).mockResolvedValue({ WS_TASK_CREATION: 'false' });
    await POST(jsonReq('POST', { title: 'Sync', taskCreationEnabled: true }));
    expect(create().data.taskCreationEnabled).toBe(true);
  });
});
