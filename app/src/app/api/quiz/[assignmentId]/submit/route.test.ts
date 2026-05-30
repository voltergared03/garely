import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonReq, ctx, mockSession } from '@/test/helpers';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/with-route', () => ({ withRoute: (_n: string, h: any) => h }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => 1) }));
vi.mock('@/lib/prisma', () => ({
  prisma: { quizAssignment: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { POST } from '@/app/api/quiz/[assignmentId]/submit/route';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notify';

const mAuth = vi.mocked(auth);
const findUnique = vi.mocked(prisma.quizAssignment.findUnique);
const update = vi.mocked(prisma.quizAssignment.update);

const assignment = (over: Record<string, any> = {}) => ({
  id: 'a1',
  userId: 'u1',
  status: 'pending',
  answers: null,
  quiz: {
    createdById: 'admin1',
    questions: [
      { id: 'q1', type: 'single', options: [{ id: 'o1', text: 'a' }, { id: 'o2', text: 'b' }], correctOptionIds: ['o1'], cites: [] },
      { id: 'q2', type: 'single', options: [{ id: 'o1', text: 'a' }, { id: 'o2', text: 'b' }], correctOptionIds: ['o2'], cites: [] },
    ],
    meeting: { id: 'm1', title: 'Standup' },
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({} as any);
});

describe('POST /api/quiz/[assignmentId]/submit', () => {
  it('401 without a session', async () => {
    mAuth.mockResolvedValue(null as any);
    const r = await POST(jsonReq('POST', { answers: {} }), ctx({ assignmentId: 'a1' }));
    expect(r.status).toBe(401);
  });

  it('403 when the caller is not the assignee', async () => {
    mAuth.mockResolvedValue(mockSession({ id: 'intruder' }));
    findUnique.mockResolvedValue(assignment() as any);
    const r = await POST(jsonReq('POST', { answers: { q1: ['o1'] } }), ctx({ assignmentId: 'a1' }));
    expect(r.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('409 when already completed (one attempt)', async () => {
    mAuth.mockResolvedValue(mockSession({ id: 'u1' }));
    findUnique.mockResolvedValue(assignment({ status: 'completed' }) as any);
    const r = await POST(jsonReq('POST', { answers: {} }), ctx({ assignmentId: 'a1' }));
    expect(r.status).toBe(409);
  });

  it('grades on the server, marks completed, notifies the creator', async () => {
    mAuth.mockResolvedValue(mockSession({ id: 'u1' }));
    findUnique.mockResolvedValue(assignment() as any);
    const r = await POST(jsonReq('POST', { answers: { q1: ['o1'], q2: ['o1'] } }), ctx({ assignmentId: 'a1' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.score).toBe(1);
    expect(body.maxScore).toBe(2);
    const arg = update.mock.calls[0][0] as any;
    expect(arg.data.status).toBe('completed');
    expect(arg.data.score).toBe(1);
    expect(notify).toHaveBeenCalled();
  });
});
