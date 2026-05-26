import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { userCanAccessMeeting } from '@/lib/access';
import { mockSession, jsonReq, ctx } from '@/test/helpers';
import { GET, POST } from '@/app/api/meetings/[id]/admit/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/access', () => ({ userCanAccessMeeting: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (k: string) => k) }));

const mockAuth = vi.mocked(auth);
const mockAccess = vi.mocked(userCanAccessMeeting);

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
  mockAccess.mockReset();
});

describe('GET /api/meetings/[id]/admit', () => {
  it('401 when not signed in', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(jsonReq('GET'), ctx({ id: 'm1' }))).status).toBe(401);
  });

  it('403 without meeting access', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockAccess.mockResolvedValue(false);
    expect((await GET(jsonReq('GET'), ctx({ id: 'm1' }))).status).toBe(403);
  });

  it('lists pending requests for a participant', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockAccess.mockResolvedValue(true);
    prismaMock.joinRequest.findMany.mockResolvedValue([{ id: 'jr1', guestName: 'G', createdAt: new Date() }] as any);
    expect((await (await GET(jsonReq('GET'), ctx({ id: 'm1' }))).json()).pending).toHaveLength(1);
  });
});

describe('POST /api/meetings/[id]/admit', () => {
  it('403 without meeting access', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockAccess.mockResolvedValue(false);
    const r = await POST(jsonReq('POST', { requestId: 'jr1', action: 'approve' }), ctx({ id: 'm1' }));
    expect(r.status).toBe(403);
  });

  it('400 when requestId or action is missing', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockAccess.mockResolvedValue(true);
    expect((await POST(jsonReq('POST', {}), ctx({ id: 'm1' }))).status).toBe(400);
  });

  it('404 when the request belongs to another meeting', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockAccess.mockResolvedValue(true);
    prismaMock.joinRequest.findUnique.mockResolvedValue({ id: 'jr1', meetingId: 'OTHER' } as any);
    const r = await POST(jsonReq('POST', { requestId: 'jr1', action: 'approve' }), ctx({ id: 'm1' }));
    expect(r.status).toBe(404);
  });

  it('approves a valid pending request', async () => {
    mockAuth.mockResolvedValue(mockSession());
    mockAccess.mockResolvedValue(true);
    prismaMock.joinRequest.findUnique.mockResolvedValue({ id: 'jr1', meetingId: 'm1' } as any);
    prismaMock.joinRequest.update.mockResolvedValue({} as any);
    const r = await POST(jsonReq('POST', { requestId: 'jr1', action: 'approve' }), ctx({ id: 'm1' }));
    expect(await r.json()).toEqual({ success: true, status: 'approved' });
  });
});
