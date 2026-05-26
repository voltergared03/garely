import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { jsonReq, ctx } from '@/test/helpers';
import { GET } from '@/app/api/meetings/join/[token]/route';

vi.mock('@/lib/prisma');

beforeEach(() => mockReset(prismaMock));

describe('GET /api/meetings/join/[token]', () => {
  it('404 for an unknown token', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue(null as any);
    expect((await GET(jsonReq('GET'), ctx({ token: 'x' }))).status).toBe(404);
  });

  it('403 when the meeting disallows guests', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', allowGuests: false, status: 'active' } as any);
    expect((await GET(jsonReq('GET'), ctx({ token: 'x' }))).status).toBe(403);
  });

  it('410 when the meeting was cancelled', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', allowGuests: true, status: 'cancelled' } as any);
    expect((await GET(jsonReq('GET'), ctx({ token: 'x' }))).status).toBe(410);
  });

  it('returns the meeting for a valid, guest-enabled token', async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({ id: 'm1', allowGuests: true, status: 'active', title: 'T' } as any);
    const r = await GET(jsonReq('GET'), ctx({ token: 'x' }));
    expect(r.status).toBe(200);
    expect((await r.json()).id).toBe('m1');
  });
});
