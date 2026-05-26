import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { isInternalAuthed } from '@/lib/internal-auth';
import { jsonReq } from '@/test/helpers';
import { POST } from '@/app/api/webhooks/report/route';

vi.mock('@/lib/prisma');
vi.mock('@/lib/internal-auth', () => ({ isInternalAuthed: vi.fn() }));
vi.mock('@/lib/report-email', () => ({ sendReportEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => {}) }));

const mockInternal = vi.mocked(isInternalAuthed);

beforeEach(() => {
  mockReset(prismaMock);
  mockInternal.mockReset();
});

describe('POST /api/webhooks/report', () => {
  it('401 without a valid internal-auth header', async () => {
    mockInternal.mockReturnValue(false);
    const r = await POST(jsonReq('POST', { meetingId: 'm1' }));
    expect(r.status).toBe(401);
  });

  it('400 when meetingId is missing (authed)', async () => {
    mockInternal.mockReturnValue(true);
    const r = await POST(jsonReq('POST', {}));
    expect(r.status).toBe(400);
  });
});
