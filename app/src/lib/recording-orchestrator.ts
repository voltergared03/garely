import { readFile } from 'fs/promises';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { readConfig } from './config';
import {
  RECORDINGS_DIR,
  startRoomRecording,
  startAudioOnlyRecording,
  startScreenTrackEgress,
  stopRecording,
} from './egress';
import { composeScreenAudio } from './recording-compose';

/** Recording strategy. Gated by the WS_RECORD_MODE workspace config. */
export type RecordMode = 'composite' | 'screen-audio';

export async function getRecordMode(): Promise<RecordMode> {
  try {
    const c = await readConfig(['WS_RECORD_MODE']);
    return c.WS_RECORD_MODE === 'screen-audio' ? 'screen-audio' : 'composite';
  } catch {
    return 'composite';
  }
}

/**
 * The actual on-disk filename for an egress — read from its `EG_<id>.json` manifest,
 * which LiveKit writes next to the output. The container/extension depends on the track
 * codec (e.g. a VP8 screen-share lands as .webm even if we requested .mp4), so the
 * requested name in meta can be wrong; the manifest is authoritative.
 */
async function resolveEgressFile(egressId: string | undefined | null, fallback: string): Promise<string> {
  if (!egressId) return fallback;
  try {
    const raw = await readFile(`${RECORDINGS_DIR}/${egressId}.json`, 'utf8');
    const j = JSON.parse(raw);
    const fn = j?.files?.[0]?.filename || j?.file?.filename;
    if (fn) return String(fn).split('/').pop() as string;
  } catch {
    /* manifest missing/unreadable → use the requested name */
  }
  return fallback;
}

async function retentionDays(): Promise<number> {
  try {
    const c = await readConfig(['WS_RETENTION_DAYS']);
    return parseInt(c.WS_RETENTION_DAYS || '0', 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Start a recording in the configured mode and create its Recording row.
 * - composite (legacy): room-composite grid MP4.
 * - screen-audio (B2-lite): continuous mixed audio (audio-only room-composite); the
 *   agent adds screen-share TrackEgress segments on top, composed offline at the end.
 * Returns true if an egress was started.
 */
export async function beginRecording(meetingId: string, roomName: string): Promise<boolean> {
  const mode = await getRecordMode();
  if (mode === 'screen-audio') {
    const aud = await startAudioOnlyRecording(roomName);
    if (!aud) return false;
    await prisma.recording.create({
      data: {
        meetingId,
        egressId: aud.egressId,
        fileName: aud.fileName,
        filePath: aud.filePath,
        status: 'processing',
        sourceType: 'screen-audio',
        meta: { audioEgressId: aud.egressId, audioFile: aud.fileName, screenSegments: [] },
      },
    });
    return true;
  }
  const rec = await startRoomRecording(roomName);
  if (!rec) return false;
  await prisma.recording.create({
    data: {
      meetingId,
      egressId: rec.egressId,
      fileName: rec.fileName,
      filePath: rec.filePath,
      status: 'processing',
      sourceType: 'egress',
    },
  });
  return true;
}

/** Stop a recording: its main egress + (screen-audio) any in-flight screen segments. */
export async function endRecording(rec: {
  egressId: string | null;
  sourceType: string | null;
  meta: unknown;
}): Promise<void> {
  if (rec.egressId) await stopRecording(rec.egressId);
  if (rec.sourceType === 'screen-audio') {
    const meta = (rec.meta as { screenSegments?: { egressId?: string; stopped?: boolean }[] }) || {};
    for (const s of meta.screenSegments || []) {
      if (s.egressId && !s.stopped) await stopRecording(s.egressId).catch(() => {});
    }
  }
}

/** Agent: a screen-share track started → record it as a TrackEgress segment. */
export async function addScreenSegment(meetingId: string, roomName: string, trackId: string): Promise<boolean> {
  const rec = await prisma.recording.findFirst({
    where: { meetingId, status: 'processing', sourceType: 'screen-audio' },
    orderBy: { createdAt: 'desc' },
  });
  if (!rec) return false;
  const seg = await startScreenTrackEgress(roomName, trackId);
  if (!seg) return false;
  const startSec = Math.max(0, (Date.now() - rec.createdAt.getTime()) / 1000);
  const meta = (rec.meta as { screenSegments?: unknown[] }) || {};
  const screenSegments = [
    ...((meta.screenSegments as unknown[]) || []),
    { egressId: seg.egressId, fileName: seg.fileName, trackId, startSec, stopped: false },
  ];
  await prisma.recording.update({ where: { id: rec.id }, data: { meta: { ...meta, screenSegments } as Prisma.InputJsonValue } });
  return true;
}

/** Agent: a screen-share track ended → stop its TrackEgress segment. */
export async function stopScreenSegment(meetingId: string, trackId: string): Promise<void> {
  const rec = await prisma.recording.findFirst({
    where: { meetingId, status: 'processing', sourceType: 'screen-audio' },
    orderBy: { createdAt: 'desc' },
  });
  if (!rec) return;
  const meta = (rec.meta as { screenSegments?: { egressId?: string; trackId?: string; stopped?: boolean }[] }) || {};
  const segs = meta.screenSegments || [];
  const seg = [...segs].reverse().find((s) => s.trackId === trackId && !s.stopped);
  if (seg?.egressId) {
    await stopRecording(seg.egressId).catch(() => {});
    seg.stopped = true;
    await prisma.recording.update({ where: { id: rec.id }, data: { meta: { ...meta, screenSegments: segs } as Prisma.InputJsonValue } });
  }
}

/**
 * Called when the AUDIO egress of a screen-audio recording ends (= recording over).
 * After a short grace (screen TrackEgress files finish writing), compose the final MP4.
 * Runs fire-and-forget in the long-lived Node server; updates the Recording when done.
 */
export function finalizeScreenAudio(recordingId: string): void {
  setTimeout(async () => {
    try {
      const rec = await prisma.recording.findUnique({ where: { id: recordingId } });
      if (!rec || rec.sourceType !== 'screen-audio') return;
      const meta = (rec.meta as { audioEgressId?: string; audioFile?: string; screenSegments?: { egressId?: string; fileName: string; startSec: number }[] }) || {};
      const audioFile = await resolveEgressFile(meta.audioEgressId, meta.audioFile || '');
      if (!audioFile) {
        await prisma.recording.update({ where: { id: rec.id }, data: { status: 'failed' } });
        return;
      }
      const segs = await Promise.all(
        (meta.screenSegments || []).map(async (s) => ({ fileName: await resolveEgressFile(s.egressId, s.fileName), startSec: s.startSec })),
      );
      const res = await composeScreenAudio({ audioFileName: audioFile, screenSegments: segs, outFileName: `rec-${rec.id}.mp4` });
      if (res.ok && res.outFile) {
        const days = await retentionDays();
        await prisma.recording.update({
          where: { id: rec.id },
          data: {
            status: 'ready',
            fileName: res.outFile,
            filePath: `${RECORDINGS_DIR}/${res.outFile}`,
            durationSec: res.durationSec ?? null,
            fileSize: res.fileSize != null ? BigInt(res.fileSize) : null,
            ...(days > 0 ? { expiresAt: new Date(Date.now() + days * 86400000) } : {}),
          },
        });
      } else {
        console.error('composeScreenAudio failed:', res.error);
        await prisma.recording.update({ where: { id: rec.id }, data: { status: 'failed' } });
      }
    } catch (e) {
      console.error('finalizeScreenAudio error:', e);
      await prisma.recording.update({ where: { id: recordingId }, data: { status: 'failed' } }).catch(() => {});
    }
  }, 6000);
}
