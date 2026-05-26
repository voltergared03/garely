import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { auth } from '@/lib/auth';
import { userCanAccessMeeting } from '@/lib/access';
import { mockSession, jsonReq, ctx } from '@/test/helpers';
import { GET } from '@/app/api/recordings/[id]/file/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/access', () => ({ userCanAccessMeeting: vi.fn() }));

const mockAuth = vi.mocked(auth);
const mockAccess = vi.mocked(userCanAccessMeeting);

beforeEach(() => {
  mockReset(prismaMock);
  mockAuth.mockReset();
  mockAccess.mockReset();
});

describe('GET /api/recordings/[id]/file', () => {
  it('401 when not signed in', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(jsonReq('GET'), ctx({ id: 'r1' }))).status).toBe(401);
  });

  it('404 when the recording is unknown', async () => {
    mockAuth.mockResolvedValue(mockSession());
    prismaMock.recording.findUnique.mockResolvedValue(null as any);
    expect((await GET(jsonReq('GET'), ctx({ id: 'r1' }))).status).toBe(404);
  });

  it('404 when the recording has no file on disk reference', async () => {
    mockAuth.mockResolvedValue(mockSession());
    prismaMock.recording.findUnique.mockResolvedValue({ id: 'r1', filePath: null, meetingId: 'm1' } as any);
    expect((await GET(jsonReq('GET'), ctx({ id: 'r1' }))).status).toBe(404);
  });

  it("403 when the user cannot access the recording's meeting", async () => {
    mockAuth.mockResolvedValue(mockSession());
    prismaMock.recording.findUnique.mockResolvedValue({ id: 'r1', filePath: '/x.webm', meetingId: 'm1' } as any);
    mockAccess.mockResolvedValue(false);
    expect((await GET(jsonReq('GET'), ctx({ id: 'r1' }))).status).toBe(403);
  });
});
