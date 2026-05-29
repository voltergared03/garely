import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jsonReq } from '@/test/helpers';

// Internal-secret check: default to authed; one test flips it off.
vi.mock('@/lib/internal-auth', () => ({ isInternalAuthed: vi.fn(() => true) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    transcriptSegment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

import { POST } from '@/app/api/webhooks/transcript/route';
import { prisma } from '@/lib/prisma';
import { isInternalAuthed } from '@/lib/internal-auth';

const findFirst = vi.mocked(prisma.transcriptSegment.findFirst);
const create = vi.mocked(prisma.transcriptSegment.create);
const update = vi.mocked(prisma.transcriptSegment.update);

const LAST = {
  id: 'seg-last',
  meetingId: 'm1',
  speakerId: 'u1',
  speakerName: 'Alice',
  content: 'Hello',
  language: 'uk',
  startTime: 0,
  endTime: 2,
  confidence: 0.9,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isInternalAuthed).mockReturnValue(true);
  create.mockResolvedValue({ id: 'seg-new' } as any);
  update.mockResolvedValue({ id: 'seg-last' } as any);
});

describe('POST /api/webhooks/transcript — merge', () => {
  it('401 when the internal secret is missing', async () => {
    vi.mocked(isInternalAuthed).mockReturnValueOnce(false);
    const r = await POST(jsonReq('POST', { meetingId: 'm1', content: 'hi' }));
    expect(r.status).toBe(401);
  });

  it('400 when content is missing', async () => {
    const r = await POST(jsonReq('POST', { meetingId: 'm1' }));
    expect(r.status).toBe(400);
  });

  it('creates a fresh row when there is no previous segment', async () => {
    findFirst.mockResolvedValue(null);
    const r = await POST(jsonReq('POST', {
      meetingId: 'm1', speakerId: 'u1', speakerName: 'Alice',
      content: 'Hello', language: 'uk', startTime: 0, endTime: 2,
    }));
    expect(r.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('merges a contiguous same-speaker / same-language final into the previous row', async () => {
    findFirst.mockResolvedValue(LAST as any);
    const r = await POST(jsonReq('POST', {
      meetingId: 'm1', speakerId: 'u1', speakerName: 'Alice',
      content: 'world', language: 'uk', startTime: 2.5, endTime: 4,
    }));
    expect(r.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0] as any;
    expect(arg.where).toEqual({ id: 'seg-last' });
    expect(arg.data.content).toBe('Hello world');
    expect(arg.data.endTime).toBe(4);
  });

  it('starts a new row when the speaker changes', async () => {
    findFirst.mockResolvedValue(LAST as any);
    const r = await POST(jsonReq('POST', {
      meetingId: 'm1', speakerId: 'u2', speakerName: 'Bob',
      content: 'different voice', language: 'uk', startTime: 2.5, endTime: 4,
    }));
    expect(r.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('starts a new row on a language switch (preserves uk↔ru boundaries)', async () => {
    findFirst.mockResolvedValue(LAST as any);
    const r = await POST(jsonReq('POST', {
      meetingId: 'm1', speakerId: 'u1', speakerName: 'Alice',
      content: 'привет', language: 'ru', startTime: 2.5, endTime: 4,
    }));
    expect(r.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('starts a new row when the silence gap is too long', async () => {
    findFirst.mockResolvedValue(LAST as any);
    const r = await POST(jsonReq('POST', {
      meetingId: 'm1', speakerId: 'u1', speakerName: 'Alice',
      content: 'much later', language: 'uk', startTime: 20, endTime: 22,
    }));
    expect(r.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
});
