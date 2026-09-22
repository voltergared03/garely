import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonReq } from '@/test/helpers';

// Hoisted so the mock factory can reference it.
const { receive } = vi.hoisted(() => ({ receive: vi.fn() }));

vi.mock('livekit-server-sdk', () => ({
  // Must be newable — the route does `new WebhookReceiver(...)` at module load.
  WebhookReceiver: class {
    receive = receive;
  },
  TrackType: { AUDIO: 0, VIDEO: 1, DATA: 2 },
  TrackSource: { UNKNOWN: 0, CAMERA: 1, MICROPHONE: 2, SCREEN_SHARE: 3, SCREEN_SHARE_AUDIO: 4 },
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    meeting: { findUnique: vi.fn(async () => ({ id: 'm1', status: 'live', livekitRoom: 'room1' })), update: vi.fn() },
    meetingParticipant: { updateMany: vi.fn() },
    recording: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock('@/lib/config', () => ({ readConfig: vi.fn(async () => ({ WS_RECORD_ALL: 'true' })) }));
vi.mock('@/lib/egress', () => ({ startRoomRecording: vi.fn(async () => {}) }));
vi.mock('@/lib/recording-orchestrator', () => ({
  beginRecording: vi.fn(async () => true),
  finalizeScreenAudio: vi.fn(),
}));

import { POST } from '@/app/api/webhooks/livekit/route';
import { beginRecording } from '@/lib/recording-orchestrator';
import { readConfig } from '@/lib/config';

const mBegin = vi.mocked(beginRecording);

/** A track_published webhook, as LiveKit sends it. */
const published = (over: Record<string, unknown> = {}) => ({
  event: 'track_published',
  room: { name: 'room1' },
  participant: { identity: 'user-1' },
  track: { type: 0, source: 2 }, // AUDIO / MICROPHONE
  ...over,
});

beforeEach(() => {
  receive.mockReset();
  vi.clearAllMocks();
  vi.mocked(readConfig).mockResolvedValue({ WS_RECORD_ALL: 'true' } as any);
});

describe('POST /api/webhooks/livekit', () => {
  it('401 when the webhook signature does not verify', async () => {
    receive.mockRejectedValue(new Error('bad signature'));
    const r = await POST(jsonReq('POST', { event: 'room_finished' }));
    expect(r.status).toBe(401);
  });
});

describe('recording starts on the first microphone, not on the first arrival', () => {
  it('starts when a human publishes a mic track', async () => {
    receive.mockResolvedValue(published());
    await POST(jsonReq('POST', {}));
    expect(mBegin).toHaveBeenCalledWith('m1', 'room1');
  });

  it('does NOT start when someone merely joins', async () => {
    // An egress that joins a silent room records nothing and ends aborted — which is
    // exactly how a meeting nobody spoke in produced a "recording failed" for its host.
    receive.mockResolvedValue({ event: 'participant_joined', room: { name: 'room1' }, participant: { identity: 'user-1' } });
    await POST(jsonReq('POST', {}));
    expect(mBegin).not.toHaveBeenCalled();
  });

  it('ignores a camera track', async () => {
    receive.mockResolvedValue(published({ track: { type: 1, source: 1 } }));
    await POST(jsonReq('POST', {}));
    expect(mBegin).not.toHaveBeenCalled();
  });

  it('ignores a screen share — it has its own egress', async () => {
    receive.mockResolvedValue(published({ track: { type: 1, source: 3 } }));
    await POST(jsonReq('POST', {}));
    expect(mBegin).not.toHaveBeenCalled();
  });

  it('ignores the agent and the recorder publishing their own tracks', async () => {
    for (const identity of ['agent-AJ_x', 'AJ_x', 'EG_x']) {
      receive.mockResolvedValue(published({ participant: { identity } }));
      await POST(jsonReq('POST', {}));
    }
    expect(mBegin).not.toHaveBeenCalled();
  });

  it('respects WS_RECORD_ALL being off', async () => {
    vi.mocked(readConfig).mockResolvedValue({ WS_RECORD_ALL: 'false' } as any);
    receive.mockResolvedValue(published());
    await POST(jsonReq('POST', {}));
    expect(mBegin).not.toHaveBeenCalled();
  });
});
