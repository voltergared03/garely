import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSession, jsonReq } from '@/test/helpers';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/with-route', () => ({ withRoute: (_n: string, h: any) => h }));
vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(async () => ({})),
  CONFIG_DEFAULTS: { WS_LIVE_TRANSCRIPTION: 'true', WS_AI_SUMMARY: 'true', WS_TASK_CREATION: 'false', WS_GUEST_ACCESS: 'true' },
}));

import { GET } from '@/app/api/settings/meeting-defaults/route';
import { auth } from '@/lib/auth';
import { readConfig } from '@/lib/config';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/settings/meeting-defaults', () => {
  it('is readable by a plain member — the full workspace endpoint is admin-only, which is why the form went blind', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession({ id: 'u1', role: 'member' }) as any);
    const body = await (await GET()).json();
    expect(body).toEqual({ transcription: true, aiReport: true, taskCreation: false, allowGuests: true });
  });

  it('reflects a saved policy over the built-in default', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession({ id: 'u1', role: 'member' }) as any);
    vi.mocked(readConfig).mockResolvedValue({ WS_TASK_CREATION: 'true', WS_LIVE_TRANSCRIPTION: 'false' });
    const body = await (await GET()).json();
    expect(body.taskCreation).toBe(true);
    expect(body.transcription).toBe(false);
  });

  it('401 without a session', async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    expect((await GET()).status).toBe(401);
  });
});
