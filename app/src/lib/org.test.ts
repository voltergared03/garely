import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentOrgId } from './org';

vi.mock('./prisma');
import { prisma } from './prisma';

// The org resolver is the seam every tenant-scoped query depends on, so it must
// (1) honour the session's org — that's what isolates one tenant from another —
// and (2) fall back to the single self-host org when the session carries none
// (old JWT minted before orgId, or a no-session context).
describe('getCurrentOrgId', () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the session's org and never consults the DB (per-tenant isolation)", async () => {
    const orgId = await getCurrentOrgId({ user: { id: 'u1', orgId: 'org-B' } } as any);
    expect(orgId).toBe('org-B');
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the singleton org when the session has no org', async () => {
    (prisma.organization.findFirst as any).mockResolvedValue({ id: 'org-1' });
    const orgId = await getCurrentOrgId({ user: { id: 'u1' } } as any);
    expect(orgId).toBeTruthy();
  });
});
