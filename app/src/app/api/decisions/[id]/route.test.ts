import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auth } from '@/lib/auth';
import { getCurrentOrgId } from '@/lib/org';
import { loadDecisionCtx, decisionMutationAllowed, updateDecisionRow, deleteDecisionRow } from '@/lib/decisions';
import { mockSession, jsonReq, ctx as routeCtx } from '@/test/helpers';
import { PATCH, DELETE } from '@/app/api/decisions/[id]/route';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/org', () => ({ getCurrentOrgId: vi.fn(async () => 'org-A') }));
vi.mock('@/lib/decisions', () => ({
  loadDecisionCtx: vi.fn(),
  decisionMutationAllowed: vi.fn(),
  updateDecisionRow: vi.fn(),
  deleteDecisionRow: vi.fn(async () => undefined),
}));

const mockAuth = vi.mocked(auth);
const mockLoad = vi.mocked(loadDecisionCtx);
const mockAllowed = vi.mocked(decisionMutationAllowed);
const mockUpdate = vi.mocked(updateDecisionRow);
const mockDelete = vi.mocked(deleteDecisionRow);

const FAKE_CTX = { id: 'd1', meetingId: 'm1', df: {}, fields: [], data: {}, tableId: 't', orgId: 'org-A' } as any;
const url = (id = 'd1') => `http://localhost/api/decisions/${id}`;

beforeEach(() => {
  mockAuth.mockReset().mockResolvedValue(mockSession({ id: 'u1' }));
  mockLoad.mockReset().mockResolvedValue(FAKE_CTX);
  mockAllowed.mockReset().mockResolvedValue(true);
  mockUpdate.mockReset().mockResolvedValue({ id: 'd1', text: 'new', ownerId: 'u2' });
  mockDelete.mockReset().mockResolvedValue(undefined);
  vi.mocked(getCurrentOrgId).mockResolvedValue('org-A');
});

describe('PATCH /api/decisions/[id]', () => {
  it('401s when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as any);
    const res = await PATCH(jsonReq('PATCH', { text: 'x' }, url()), routeCtx({ id: 'd1' }));
    expect(res.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('400s when no editable fields are provided', async () => {
    const res = await PATCH(jsonReq('PATCH', {}, url()), routeCtx({ id: 'd1' }));
    expect(res.status).toBe(400);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('404s when the decision is not found / not a decision row', async () => {
    mockLoad.mockResolvedValue(null);
    const res = await PATCH(jsonReq('PATCH', { text: 'x' }, url()), routeCtx({ id: 'd1' }));
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('403s when the user may not mutate', async () => {
    mockAllowed.mockResolvedValue(false);
    const res = await PATCH(jsonReq('PATCH', { text: 'x' }, url()), routeCtx({ id: 'd1' }));
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates text + owner and returns the new values', async () => {
    const res = await PATCH(jsonReq('PATCH', { text: 'new', ownerId: 'u2' }, url()), routeCtx({ id: 'd1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'd1', text: 'new', ownerId: 'u2' });
    expect(mockUpdate).toHaveBeenCalledWith(FAKE_CTX, { text: 'new', ownerId: 'u2' });
    // org is pinned from the session, never the client
    expect(mockLoad).toHaveBeenCalledWith('d1', 'org-A');
  });
});

describe('DELETE /api/decisions/[id]', () => {
  it('401s when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as any);
    const res = await DELETE(jsonReq('DELETE', undefined, url()), routeCtx({ id: 'd1' }));
    expect(res.status).toBe(401);
  });

  it('404s when missing, 403s when not allowed', async () => {
    mockLoad.mockResolvedValueOnce(null);
    expect((await DELETE(jsonReq('DELETE', undefined, url()), routeCtx({ id: 'd1' }))).status).toBe(404);
    mockLoad.mockResolvedValue(FAKE_CTX);
    mockAllowed.mockResolvedValue(false);
    expect((await DELETE(jsonReq('DELETE', undefined, url()), routeCtx({ id: 'd1' }))).status).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes when allowed', async () => {
    const res = await DELETE(jsonReq('DELETE', undefined, url()), routeCtx({ id: 'd1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDelete).toHaveBeenCalledWith('d1');
  });
});
