import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonReq } from '@/test/helpers';

// Hoisted so the mock factory can reference it.
const { receive } = vi.hoisted(() => ({ receive: vi.fn() }));

vi.mock('livekit-server-sdk', () => ({
  // Must be newable — the route does `new WebhookReceiver(...)` at module load.
  WebhookReceiver: class {
    receive = receive;
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/config', () => ({ readConfig: vi.fn(async () => ({})) }));
vi.mock('@/lib/egress', () => ({ startRoomRecording: vi.fn(async () => {}) }));

import { POST } from '@/app/api/webhooks/livekit/route';

beforeEach(() => {
  receive.mockReset();
});

describe('POST /api/webhooks/livekit', () => {
  it('401 when the webhook signature does not verify', async () => {
    receive.mockRejectedValue(new Error('bad signature'));
    const r = await POST(jsonReq('POST', { event: 'room_finished' }));
    expect(r.status).toBe(401);
  });
});
