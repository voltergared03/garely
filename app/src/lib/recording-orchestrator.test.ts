import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset } from 'vitest-mock-extended';
import { prisma as prismaMock } from '@/lib/__mocks__/prisma';
import { finalizeScreenAudio } from '@/lib/recording-orchestrator';
import { composeScreenAudio, probeDurationSec } from '@/lib/recording-compose';
import { notify } from '@/lib/notify';
import { readFile, readdir, stat } from 'fs/promises';

vi.mock('@/lib/prisma');
vi.mock('@/lib/recording-compose', () => ({
  composeScreenAudio: vi.fn(),
  probeDurationSec: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => 1) }));
vi.mock('@/lib/config', () => ({ readConfig: vi.fn(async () => ({})) }));
vi.mock('@/lib/egress', () => ({
  RECORDINGS_DIR: '/recordings',
  startRoomRecording: vi.fn(),
  startAudioOnlyRecording: vi.fn(),
  startScreenTrackEgress: vi.fn(),
  stopRecording: vi.fn(),
}));
vi.mock('fs/promises', () => ({ readFile: vi.fn(), readdir: vi.fn(), stat: vi.fn() }));

const mCompose = vi.mocked(composeScreenAudio);
const mProbe = vi.mocked(probeDurationSec);
const mNotify = vi.mocked(notify);
const mReadFile = vi.mocked(readFile);
const mReaddir = vi.mocked(readdir);
const mStat = vi.mocked(stat);

const REC = {
  id: 'r1',
  sourceType: 'screen-audio',
  meta: {
    audioEgressId: 'EG_aud',
    audioFile: 'aud-room-1.ogg',
    screenSegments: [{ egressId: 'EG_scr', fileName: 'scr-room-1.mp4', startSec: 10 }],
  },
};

/** finalizeScreenAudio defers by 6s; run its timer and let the async body settle. */
async function runFinalize(id = 'r1') {
  finalizeScreenAudio(id);
  await vi.advanceTimersByTimeAsync(6000);
  await vi.waitFor(() => {
    const touched = prismaMock.recording.update.mock.calls.length > 0;
    if (!touched) throw new Error('not settled');
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReset(prismaMock);
  vi.clearAllMocks();
  prismaMock.recording.findUnique.mockResolvedValue(REC as any);
  prismaMock.recording.update.mockResolvedValue({ meetingId: 'm1', meeting: { title: 'Sync', createdById: 'u1' } } as any);
  prismaMock.user.findMany.mockResolvedValue([] as any);
  mReadFile.mockRejectedValue(new Error('no manifest')); // the aborted-handler case
  mReaddir.mockResolvedValue([] as any);
  mStat.mockResolvedValue({ size: 4242 } as any);
});

describe('finalizeScreenAudio — a broken compose must not cost us the audio', () => {
  it('registers the audio track when the compose fails, instead of failing the recording', async () => {
    // Six meetings (3 to 57 minutes each) were written off as "failed" while their
    // audio sat on the volume the whole time. Losing the screen video is not a reason
    // to lose everything that was said.
    mProbe.mockResolvedValue(1800);
    mCompose.mockResolvedValue({ ok: false, error: 'ffmpeg: no such file' } as any);

    await runFinalize();

    const data = (prismaMock.recording.update.mock.calls.at(-1)![0] as any).data;
    expect(data.status).toBe('ready');
    expect(data.fileName).toBe('aud-room-1.ogg');
    expect(data.durationSec).toBe(1800);
    expect(data.fileSize).toBe(BigInt(4242));
    expect(data.meta.salvaged).toBe('audio-only');
    expect(data.meta.salvageReason).toContain('ffmpeg');
  });

  it('prefers the composed file when the compose works', async () => {
    mProbe.mockResolvedValue(1800);
    mCompose.mockResolvedValue({ ok: true, outFile: 'rec-r1.mp4', durationSec: 1805, fileSize: 999 } as any);

    await runFinalize();

    const data = (prismaMock.recording.update.mock.calls.at(-1)![0] as any).data;
    expect(data.status).toBe('ready');
    expect(data.fileName).toBe('rec-r1.mp4');
    expect(data.meta).toBeUndefined();
  });
});

describe('finalizeScreenAudio — an empty room is not a recorder fault', () => {
  it('reports "no audio" rather than a compose error when nothing was ever published', async () => {
    // The 2026-09-22 meeting: egress joined, waited 22 minutes for a first media
    // sample that never came, and the host was told the compose had failed.
    mProbe.mockResolvedValue(0);

    await runFinalize();

    const data = (prismaMock.recording.update.mock.calls.at(-1)![0] as any).data;
    expect(data.status).toBe('failed');
    expect(data.meta.failureKind).toBe('no-audio');
    expect(mCompose).not.toHaveBeenCalled();
    expect(mNotify.mock.calls[0]?.[0].titleKey).toBe('recordingNoAudioTitle');
  });

  it('keeps the blunt failure copy for a genuine recorder fault', async () => {
    mProbe.mockResolvedValue(1800);
    mCompose.mockResolvedValue({ ok: false, error: 'boom' } as any);
    prismaMock.recording.update
      .mockRejectedValueOnce(new Error('db down'))          // salvage write fails
      .mockResolvedValue({ meetingId: 'm1', meeting: { title: 'Sync', createdById: 'u1' } } as any);

    await runFinalize();

    const data = (prismaMock.recording.update.mock.calls.at(-1)![0] as any).data;
    expect(data.status).toBe('failed');
    expect(data.meta.failureKind).toBe('compose');
    expect(mNotify.mock.calls[0]?.[0].titleKey).toBe('recordingFailedTitle');
  });
});

describe('egress file resolution — the requested name is not the written name', () => {
  it('finds the screen segment by basename when LiveKit wrote a different container', async () => {
    // We ask for scr-<room>-<ts>.mp4; LiveKit's DirectFileOutput writes the raw VP8
    // track as .webm and the manifest an aborted handler never wrote cannot correct us.
    // Feeding ffmpeg the name we asked for is how a partly-recorded meeting became a
    // total loss.
    mProbe.mockImplementation(async (f: string) =>
      f.endsWith('aud-room-1.ogg') ? 1800 : f.endsWith('scr-room-1.webm') ? 600 : 0);
    mReaddir.mockResolvedValue(['aud-room-1.ogg', 'scr-room-1.webm'] as any);
    mCompose.mockResolvedValue({ ok: true, outFile: 'rec-r1.mp4', durationSec: 1800, fileSize: 10 } as any);

    await runFinalize();

    expect(mCompose).toHaveBeenCalledTimes(1);
    const arg = mCompose.mock.calls[0][0] as any;
    expect(arg.audioFileName).toBe('aud-room-1.ogg');
    expect(arg.screenSegments[0].fileName).toBe('scr-room-1.webm');
  });

  it('keeps the requested name when nothing on disk matches', async () => {
    mProbe.mockImplementation(async (f: string) => (f.endsWith('aud-room-1.ogg') ? 1800 : 0));
    mReaddir.mockResolvedValue(['something-else.webm'] as any);
    mCompose.mockResolvedValue({ ok: true, outFile: 'rec-r1.mp4', durationSec: 1800, fileSize: 10 } as any);

    await runFinalize();

    const arg = mCompose.mock.calls[0][0] as any;
    expect(arg.screenSegments[0].fileName).toBe('scr-room-1.mp4');
  });
})

