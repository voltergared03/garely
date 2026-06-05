import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auth } from '@/lib/auth';
import { createTaskField, listTaskFields } from '@/lib/tasks';
import { jsonReq } from '@/test/helpers';
import { GET, POST } from '@/app/api/tasks/fields/route';

// The system Tasks table is hidden from the generic engine (3.2 guard), so its
// field schema is managed here. Mutations are admin-gated and the table id is
// resolved from the caller's org — never from the request body.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/tasks', () => ({
  createTaskField: vi.fn(),
  listTaskFields: vi.fn(async () => []),
}));

const mockAuth = vi.mocked(auth);
const mockCreate = vi.mocked(createTaskField);
const mockList = vi.mocked(listTaskFields);
const url = 'http://localhost/api/tasks/fields';
const sess = (role = 'admin', orgId = 'org-A') => ({ user: { id: 'u1', role, orgId } }) as any;

beforeEach(() => {
  mockAuth.mockReset();
  mockCreate.mockReset();
  mockList.mockReset().mockResolvedValue([]);
});

describe('GET /api/tasks/fields', () => {
  it('401 when signed out', async () => {
    mockAuth.mockResolvedValue(null as any);
    expect((await GET(jsonReq('GET', undefined, url))).status).toBe(401);
  });

  it('returns the field schema for any member', async () => {
    mockAuth.mockResolvedValue(sess('member'));
    mockList.mockResolvedValue([{ id: 'fX' }] as any);
    const r = await GET(jsonReq('GET', undefined, url));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([{ id: 'fX' }]);
  });
});

describe('POST /api/tasks/fields — admin-gated schema mutation', () => {
  it('403 for non-admin members', async () => {
    mockAuth.mockResolvedValue(sess('member'));
    const r = await POST(jsonReq('POST', { name: 'Cost', type: 'currency' }, url));
    expect(r.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('admin creates a field with org from the session; a client-supplied tableId is ignored', async () => {
    mockAuth.mockResolvedValue(sess('admin'));
    mockCreate.mockResolvedValue({ field: { id: 'fX', name: 'Cost' } as any });
    const r = await POST(jsonReq('POST', { name: 'Cost', type: 'currency', tableId: 'evil' }, url));
    expect(r.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith('org-A', expect.objectContaining({ name: 'Cost', type: 'currency' }));
    const arg = mockCreate.mock.calls[0][1] as Record<string, unknown>;
    expect('tableId' in arg).toBe(false); // zod stripped the rogue key
  });

  it('400 on an invalid body (missing type)', async () => {
    mockAuth.mockResolvedValue(sess('admin'));
    expect((await POST(jsonReq('POST', { name: 'Cost' }, url))).status).toBe(400);
  });

  it('surfaces the adapter error (e.g. unsupported link field)', async () => {
    mockAuth.mockResolvedValue(sess('admin'));
    mockCreate.mockResolvedValue({ error: 'unsupported_field_type', status: 400 });
    const r = await POST(jsonReq('POST', { name: 'Rel', type: 'link' }, url));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('unsupported_field_type');
  });
});
