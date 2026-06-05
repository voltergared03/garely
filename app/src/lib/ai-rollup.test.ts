import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiWeeklyRollup } from '@/lib/ai-rollup';
import { getDeepSeekConfig } from '@/lib/config';

vi.mock('@/lib/config', () => ({ getDeepSeekConfig: vi.fn() }));
const mockCfg = vi.mocked(getDeepSeekConfig);

beforeEach(() => {
  mockCfg.mockReset();
  vi.unstubAllGlobals();
});

describe('aiWeeklyRollup — best-effort, never throws / never blocks the digest', () => {
  it('returns null when no API key is configured', async () => {
    mockCfg.mockResolvedValue({ apiKey: '', baseUrl: 'http://x', model: 'm' } as any);
    expect(await aiWeeklyRollup({ name: 'Dana', taskTitles: ['t1'], meetingCount: 1, langName: 'English' })).toBeNull();
  });

  it('returns null when there are no open tasks (nothing to summarize)', async () => {
    mockCfg.mockResolvedValue({ apiKey: 'k', baseUrl: 'http://x', model: 'm' } as any);
    expect(await aiWeeklyRollup({ name: 'Dana', taskTitles: [], meetingCount: 2, langName: 'English' })).toBeNull();
  });

  it('returns null (does not throw) when the AI request fails', async () => {
    mockCfg.mockResolvedValue({ apiKey: 'k', baseUrl: 'http://x', model: 'm' } as any);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect(await aiWeeklyRollup({ name: 'Dana', taskTitles: ['ship it'], meetingCount: 1, langName: 'English' })).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    mockCfg.mockResolvedValue({ apiKey: 'k', baseUrl: 'http://x', model: 'm' } as any);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, body: null }) as any));
    expect(await aiWeeklyRollup({ name: 'Dana', taskTitles: ['ship it'], meetingCount: 1, langName: 'English' })).toBeNull();
  });
});
