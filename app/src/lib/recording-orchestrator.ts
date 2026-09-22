import { readFile, readdir, stat } from 'fs/promises';
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
import { composeScreenAudio, probeDurationSec } from './recording-compose';
import { notify } from './notify';

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
async function egressInfo(
  egressId: string | undefined | null,
  fallbackFile: string,
): Promise<{ file: string; endedNs: number | null }> {
  if (!egressId) return { file: fallbackFile, endedNs: null };
  try {
    const raw = await readFile(`${RECORDINGS_DIR}/${egressId}.json`, 'utf8');
    const j = JSON.parse(raw);
    const fn = j?.files?.[0]?.filename || j?.file?.filename;
    const ended = Number(j?.ended_at);
    return {
      file: fn ? (String(fn).split('/').pop() as string) : fallbackFile,
      endedNs: Number.isFinite(ended) && ended > 0 ? ended : null,
    };
  } catch {
    /* Manifest missing (an aborted handler never writes one) → the requested name is
       the WRONG name for anything whose container depends on the codec, so look the
       basename up on disk before falling back to it. Trusting the requested `.mp4` for
       a screen share LiveKit had written as `.webm` is what fed ffmpeg a nonexistent
       input and turned six partly-recorded meetings into total losses. */
    return { file: await resolveOnDisk(fallbackFile), endedNs: null };
  }
}

/**
 * The real file for a requested name, matched by basename with any extension.
 * Returns the requested name unchanged when nothing matches (caller still errors,
 * but on the name it actually asked for).
 */
async function resolveOnDisk(requested: string): Promise<string> {
  if (!requested) return requested;
  const stem = requested.replace(/\.[^.]+$/, '');
  try {
    if (await probeDurationSec(`${RECORDINGS_DIR}/${requested}`) > 0) return requested;
    const hit = (await readdir(RECORDINGS_DIR)).find((f) => f.replace(/\.[^.]+$/, '') === stem);
    return hit || requested;
  } catch {
    return requested;
  }
}

/**
 * Wall-clock time (ms) of the FIRST media sample in an egress file. Egress `started_at`
 * is when the job launched, but actual media begins after startup latency (room-composite
 * audio waits for headless Chrome to join + subscribe → several seconds; a raw screen
 * TrackEgress is near-instant). Since the file ENDS promptly when the egress stops, the
 * reliable media-start = ended_at − fileDuration. Aligning two egresses by this removes
 * the differing-startup-latency skew that a `started_at` delta would leave behind.
 */
async function mediaStartMs(egressId: string | undefined | null, file: string): Promise<number | null> {
  const info = await egressInfo(egressId, file);
  if (info.endedNs == null) return null;
  const dur = await probeDurationSec(`${RECORDINGS_DIR}/${info.file}`);
  if (!(dur > 0)) return null;
  return info.endedNs / 1e6 - dur * 1000;
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
  // Recording now starts on the first microphone anyone turns on, and in a call where
  // five people unmute at once that is five webhooks within milliseconds. The DB check
  // the caller does cannot settle that race on its own — every one of them reads "no
  // recording yet" before the first create lands — so collapse concurrent starts for a
  // meeting onto one promise here, where every caller passes through.
  const inFlight = startsInFlight.get(meetingId);
  if (inFlight) return inFlight;
  const run = startRecording(meetingId, roomName).finally(() => startsInFlight.delete(meetingId));
  startsInFlight.set(meetingId, run);
  return run;
}

/** Single-process guard. One app container today; a second would need a DB lock. */
const startsInFlight = new Map<string, Promise<boolean>>();

async function startRecording(meetingId: string, roomName: string): Promise<boolean> {
  // Re-check inside the guard: a start that already finished is not in the map any more,
  // and its row is the only thing that keeps the next unmute from opening a second egress.
  const already = await prisma.recording.findFirst({
    where: { meetingId, status: { in: ['processing', 'ready'] } },
    select: { id: true },
  });
  if (already) return false;
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
 * Mark a recording failed AND tell somebody.
 *
 * A failed recording used to be completely silent: the row flipped to "failed", no
 * screen renders that state, and the meeting simply looked like one that was never
 * recorded. On 2026-08-26 a 52-minute call lost its audio four minutes in — the egress
 * CPU guard killed the handler — and nobody found out until someone went looking for
 * the file hours later, by which point the meeting could not be re-run.
 *
 * The transcript and the AI report survive independently (the agent subscribes to the
 * tracks directly, no browser involved), so only the media file is lost — but whoever
 * called the meeting is the person who needs to know that.
 */
type FailureKind = 'no-audio' | 'compose' | 'unknown';

async function failRecording(recordingId: string, reason: string, kind: FailureKind = 'unknown'): Promise<void> {
  console.error(`[recording] ${recordingId} failed (${kind}): ${reason}`);
  let meetingId: string | null = null;
  let title = '';
  let createdById: string | null = null;
  try {
    // The reason rides along in meta: without it every post-mortem starts by guessing
    // which of the pipeline's several failure paths ran, and the 2026-09-22 meeting was
    // reported as "compose failed" when nothing had ever been composed.
    const prev = await prisma.recording.findUnique({ where: { id: recordingId }, select: { meta: true } });
    const rec = await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: 'failed',
        meta: { ...((prev?.meta as Record<string, unknown>) || {}), failureKind: kind, failureReason: reason } as Prisma.InputJsonValue,
      },
      select: { meetingId: true, meeting: { select: { title: true, createdById: true } } },
    });
    meetingId = rec.meetingId;
    title = rec.meeting?.title || '';
    createdById = rec.meeting?.createdById ?? null;
  } catch (e) {
    console.error('[recording] could not mark failed:', (e as Error).message);
    return;
  }
  // Notifying is best-effort and must never undo the status write above.
  try {
    const admins = await prisma.user.findMany({ where: { role: 'admin', status: 'active' }, select: { id: true } });
    const userIds = [...new Set([createdById, ...admins.map((a) => a.id)].filter(Boolean) as string[])];
    if (userIds.length && meetingId) {
      await notify({
        userIds,
        type: 'recording_failed',
        titleKey: kind === 'no-audio' ? 'recordingNoAudioTitle' : 'recordingFailedTitle',
        bodyKey: kind === 'no-audio' ? 'recordingNoAudioBody' : 'recordingFailedBody',
        values: { title },
        link: `/meetings/${meetingId}/report`,
        meetingId,
      });
    }
  } catch (e) {
    console.error('[recording] failure notify skipped:', (e as Error).message);
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
      const audio = await egressInfo(meta.audioEgressId, meta.audioFile || '');
      // Is there audio at all? An egress that joined a room where nobody ever unmuted
      // aborts with "Start signal not received" and writes NO file — that is not a
      // recorder fault and must not be reported as one.
      const audioSec = audio.file ? await probeDurationSec(`${RECORDINGS_DIR}/${audio.file}`) : 0;
      if (!(audioSec > 0)) {
        await failRecording(rec.id, 'no audio was ever published in the room', 'no-audio');
        return;
      }
      // Place each screen segment by the real MEDIA-start delta vs the audio (ended_at −
      // file duration), so the differing egress startup latencies don't skew the timeline.
      const audioStartMs = await mediaStartMs(meta.audioEgressId, audio.file);
      const segs = await Promise.all(
        (meta.screenSegments || []).map(async (s) => {
          const info = await egressInfo(s.egressId, s.fileName);
          const segStartMs = await mediaStartMs(s.egressId, info.file);
          const startSec =
            audioStartMs != null && segStartMs != null
              ? Math.max(0, (segStartMs - audioStartMs) / 1000)
              : s.startSec;
          return { fileName: info.file, startSec };
        }),
      );
      const audioFile = audio.file;
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
        // The screen video could not be muxed — a missing segment file, a codec ffmpeg
        // would not take, anything. That is no reason to throw away the audio: it is a
        // complete recording of everything that was SAID, and it is already on disk.
        // Seven meetings (3 to 57 minutes each) were written off this way before anyone
        // noticed the files had been there the whole time.
        await salvageAudioOnly(rec.id, audio.file, audioSec, `compose failed: ${res.error}`);
      }
    } catch (e) {
      await failRecording(recordingId, `finalize threw: ${(e as Error).message}`);
    }
  }, 6000);
}

/**
 * Register the raw mixed audio as the recording when the screen compose could not be
 * produced. The meeting keeps everything that was said; only the screen video is lost,
 * and `meta.salvaged` records why so the report can say so rather than implying the
 * recording is whole.
 */
async function salvageAudioOnly(
  recordingId: string,
  audioFile: string,
  durationSec: number,
  reason: string,
): Promise<void> {
  console.error(`[recording] ${recordingId} salvaged to audio-only: ${reason}`);
  try {
    const prev = await prisma.recording.findUnique({ where: { id: recordingId }, select: { meta: true } });
    const days = await retentionDays();
    const size = await fileSizeBytes(`${RECORDINGS_DIR}/${audioFile}`);
    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: 'ready',
        fileName: audioFile,
        filePath: `${RECORDINGS_DIR}/${audioFile}`,
        durationSec: Math.round(durationSec),
        fileSize: size != null ? BigInt(size) : null,
        meta: { ...((prev?.meta as Record<string, unknown>) || {}), salvaged: 'audio-only', salvageReason: reason } as Prisma.InputJsonValue,
        ...(days > 0 ? { expiresAt: new Date(Date.now() + days * 86400000) } : {}),
      },
    });
  } catch (e) {
    // Salvage is the fallback; if even that fails, fall back to the honest failure.
    await failRecording(recordingId, `${reason}; salvage also failed: ${(e as Error).message}`, 'compose');
  }
}

async function fileSizeBytes(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}
