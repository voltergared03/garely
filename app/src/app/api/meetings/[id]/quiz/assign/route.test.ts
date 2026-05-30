import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonReq, ctx, mockSession } from '@/test/helpers';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/with-route', () => ({ withRoute: (_n: string, h: any) => h }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => 1) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    meeting: { findUnique: vi.fn() },
    quiz: { findUnique: vi.fn(), update: vi.fn() },
    meetingParticipant: { findMany: vi.fn() },
    quizAssignment: { findMany: vi.fn(), create: vi.fn() },
  },
}));

import { POST } from '@/app/api/meetings/[id]/quiz/assign/route';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const mAuth = vi.mocked(auth);
const meetingFind = vi.mocked(prisma.meeting.findUnique);
const quizFind = vi.mocked(prisma.quiz.findUnique);
const quizUpdate = vi.mocked(prisma.quiz.update);
const partFind = vi.mocked(prisma.meetingParticipant.findMany);
const asgFind = vi.mocked(prisma.quizAssignment.findMany);
const asgCreate = vi.mocked(prisma.quizAssignment.create);

beforeEach(() => {
  vi.clearAllMocks();
  meetingFind.mockResolvedValue({ createdById: 'owner-1', title: 'M' } as any);
  quizFind.mockResolvedValue({ id: 'qz', questions: [{ id: 'q1' }, { id: 'q2' }] } as any);
  quizUpdate.mockResolvedValue({} as any);
  asgFind.mockResolvedValue([]); // nobody assigned yet
  asgCreate.mockImplementation(async (args: any) => ({ id: 'as-' + args.data.userId, userId: args.data.userId }) as any);
});

describe('POST /api/meetings/[id]/quiz/assign', () => {
  it('401 without a session', async () => {
    mAuth.mockResolvedValue(null as any);
    const r = await POST(jsonReq('POST', { userIds: ['u1'] }), ctx({ id: 'm1' }));
    expect(r.status).toBe(401);
  });

  it('403 for a non-owner, non-admin', async () => {
    mAuth.mockResolvedValue(mockSession({ id: 'intruder', role: 'member' }));
    const r = await POST(jsonReq('POST', { userIds: ['u1'] }), ctx({ id: 'm1' }));
    expect(r.status).toBe(403);
    expect(asgCreate).not.toHaveBeenCalled();
  });

  it('only assigns registered participants of the meeting', async () => {
    mAuth.mockResolvedValue(mockSession({ id: 'a', role: 'admin' }));
    partFind.mockResolvedValue([]); // none of the userIds are participants
    const r = await POST(jsonReq('POST', { userIds: ['stranger'] }), ctx({ id: 'm1' }));
    expect(r.status).toBe(400);
    expect(asgCreate).not.toHaveBeenCalled();
  });

  it('creates assignments for new eligible users, skipping already-assigned (idempotent)', async () => {
    mAuth.mockResolvedValue(mockSession({ id: 'a', role: 'admin' }));
    partFind.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }] as any);
    asgFind.mockResolvedValue([{ userId: 'u1' }] as any); // u1 already assigned
    const r = await POST(jsonReq('POST', { userIds: ['u1', 'u2'] }), ctx({ id: 'm1' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.assigned).toBe(1); // only u2 newly assigned
    expect(asgCreate).toHaveBeenCalledTimes(1);
    expect((asgCreate.mock.calls[0][0] as any).data.userId).toBe('u2');
    expect(quizUpdate).toHaveBeenCalled(); // quiz flipped to assigned
  });
});
