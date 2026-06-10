import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { userCanAccessMeeting } from '@/lib/access';
import { mockSession, jsonReq, ctx } from '@/test/helpers';
import { GET } from '@/app/api/meetings/join/[token]/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/access', () => ({ userCanAccessMeeting: vi.fn() }));

const mockAuth = vi.mocked(auth);
const mockAccess = vi.mocked(userCanAccessMeeting);

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
  mockAccess.mockReset();
  mockAuth.mockResolvedValue(null); // anonymous unless a test says otherwise
});

describe('GET /api/meetings/join/[token]', () => {
  it('404 for an unknown token', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue(null as any);
    expect((await GET(jsonReq('GET'), ctx({ token: 'x' }))).status).toBe(404);
  });

  it('403 when the meeting disallows guests and the viewer is anonymous', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', allowGuests: false, status: 'active' } as any);
    expect((await GET(jsonReq('GET'), ctx({ token: 'x' }))).status).toBe(403);
  });

  it('200 for a signed-in member even when guests are disabled', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', allowGuests: false, status: 'active', title: 'T' } as any);
    mockAuth.mockResolvedValue(mockSession());
    mockAccess.mockResolvedValue(true);
    expect((await GET(jsonReq('GET'), ctx({ token: 'x' }))).status).toBe(200);
  });

  it('410 when the meeting was cancelled', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', allowGuests: true, status: 'cancelled' } as any);
    const r = await GET(jsonReq('GET'), ctx({ token: 'x' }));
    expect(r.status).toBe(410);
    expect((await r.json()).reason).toBe('cancelled');
  });

  it('410 when the meeting has ended', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', allowGuests: true, status: 'ended' } as any);
    const r = await GET(jsonReq('GET'), ctx({ token: 'x' }));
    expect(r.status).toBe(410);
    expect((await r.json()).reason).toBe('ended');
  });

  it('returns the meeting for a valid, guest-enabled token', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', allowGuests: true, status: 'active', title: 'T' } as any);
    const r = await GET(jsonReq('GET'), ctx({ token: 'x' }));
    expect(r.status).toBe(200);
    expect((await r.json()).id).toBe('m1');
  });
});
