import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auth } from '@/lib/auth';
import { listDecisions } from '@/lib/decisions';
import { mockSession, jsonReq } from '@/test/helpers';
import { GET } from '@/app/api/decisions/route';

// The route is a thin read surface over the lib/decisions adapter (whose own
// authz/filter logic is unit-tested in lib/decisions.test.ts). Here we assert
// the auth gate + that query params are forwarded verbatim.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/decisions', () => ({ listDecisions: vi.fn(async () => []) }));

const mockAuth = vi.mocked(auth);
const mockList = vi.mocked(listDecisions);

beforeEach(() => {
  mockAuth.mockReset();
  mockList.mockReset().mockResolvedValue([]);
});

const url = (qs = '') => `http://localhost/api/decisions${qs}`;

describe('GET /api/decisions', () => {
  it('401s when unauthenticated and never queries decisions', async () => {
    mockAuth.mockResolvedValue(null as any);
    const res = await GET(jsonReq('GET', undefined, url()));
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('returns the decisions list for an authed user', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1' }));
    mockList.mockResolvedValue([{ id: 'd1', text: 'X' }] as any);
    const res = await GET(jsonReq('GET', undefined, url()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'd1', text: 'X' }]);
  });

  it('forwards meetingId / owner / q filters to the adapter', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1' }));
    await GET(jsonReq('GET', undefined, url('?meetingId=m1&owner=u2&q=ship')));
    expect(mockList).toHaveBeenCalledWith(expect.anything(), { meetingId: 'm1', owner: 'u2', q: 'ship' });
  });

  it('passes nulls when no filters are provided', async () => {
    mockAuth.mockResolvedValue(mockSession({ id: 'u1' }));
    await GET(jsonReq('GET', undefined, url()));
    expect(mockList).toHaveBeenCalledWith(expect.anything(), { meetingId: null, owner: null, q: null });
  });
});
