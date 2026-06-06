import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auth } from '@/lib/auth';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { verifySetupToken, markSetupComplete, provisionFirstOrg } from '@/lib/setup';
import { mockSession, jsonReq } from '@/test/helpers';
import { POST } from '@/app/api/setup/complete/route';

// Regression lock: the Google-auth setup path MUST create the first org
// (it previously only promoted the user → installs came up with no org).
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma');
vi.mock('@/lib/setup', () => ({
  verifySetupToken: vi.fn(async () => true),
  markSetupComplete: vi.fn(async () => {}),
  provisionFirstOrg: vi.fn(async () => ({ id: 'org-new' })),
}));

const mockAuth = vi.mocked(auth);
const url = 'http://localhost/api/setup/complete';

beforeEach(() => {
  mockAuth.mockReset();
  vi.mocked(verifySetupToken).mockReset().mockResolvedValue(true);
  vi.mocked(markSetupComplete).mockReset().mockResolvedValue(undefined);
  vi.mocked(provisionFirstOrg).mockReset().mockResolvedValue({ id: 'org-new' });
  prismaMock.user.update.mockResolvedValue({} as any);
});

describe('POST /api/setup/complete (Google-auth path)', () => {
  it('403s on a bad setup token', async () => {
    vi.mocked(verifySetupToken).mockResolvedValue(false);
    const res = await POST(jsonReq('POST', { token: 'x' }, url));
    expect(res.status).toBe(403);
    expect(provisionFirstOrg).not.toHaveBeenCalled();
  });

  it('401s when no Google session is present', async () => {
    mockAuth.mockResolvedValue(null as any);
    const res = await POST(jsonReq('POST', { token: 'ok' }, url));
    expect(res.status).toBe(401);
    expect(provisionFirstOrg).not.toHaveBeenCalled();
  });

  it('promotes the user AND provisions the first org, then completes', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1' }));
    const res = await POST(jsonReq('POST', { token: 'ok' }, url));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' }, data: { role: 'admin' } }));
    expect(provisionFirstOrg).toHaveBeenCalledWith('u1');
    expect(markSetupComplete).toHaveBeenCalled();
  });
});
