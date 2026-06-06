import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { provisionFirstOrg } from '@/lib/setup';

vi.mock('@/lib/prisma');
vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(async () => ({ WS_NAME: 'Acme Corp' })),
  writeConfig: vi.fn(async () => {}),
  getGoogleConfig: vi.fn(async () => ({ clientId: '', clientSecret: '' })),
  CONFIG_DEFAULTS: { WS_NAME: 'Workspace', WS_TIMEZONE: 'UTC', WS_LANGUAGE: 'en' },
}));

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.membership.upsert.mockResolvedValue({} as any);
});

describe('provisionFirstOrg — shared by both setup paths', () => {
  it('creates org #1 from WS_NAME (slugified) + an OWNER membership on a fresh DB', async () => {
    prismaMock.organization.findFirst.mockResolvedValue(null as any);
    prismaMock.organization.create.mockResolvedValue({ id: 'org-new' } as any);

    const out = await provisionFirstOrg('admin1');

    expect(out).toEqual({ id: 'org-new' });
    expect((prismaMock.organization.create.mock.calls[0][0] as any).data).toMatchObject({ name: 'Acme Corp', slug: 'acme-corp' });
    expect(prismaMock.membership.upsert.mock.calls[0][0]).toMatchObject({
      where: { orgId_userId: { orgId: 'org-new', userId: 'admin1' } },
      create: { orgId: 'org-new', userId: 'admin1', role: 'OWNER' },
      update: { role: 'OWNER' },
    });
  });

  it('is idempotent — reuses an existing org, never creates a second, still ensures OWNER', async () => {
    prismaMock.organization.findFirst.mockResolvedValue({ id: 'org-existing' } as any);

    const out = await provisionFirstOrg('admin2');

    expect(out).toEqual({ id: 'org-existing' });
    expect(prismaMock.organization.create).not.toHaveBeenCalled();
    expect((prismaMock.membership.upsert.mock.calls[0][0] as any).where.orgId_userId.orgId).toBe('org-existing');
  });
});
