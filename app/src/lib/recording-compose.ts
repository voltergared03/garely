import { spawn } from 'child_process';
import { stat } from 'fs/promises';
import path from 'path';
import { RECORDINGS_DIR } from './egress';

/**
 * Offline ffmpeg compose for the B2-lite "screen-audio" recording mode.
 *
 * Inputs produced live (cheaply): one continuous MIXED-audio track (audio-only
 * room-composite egress, t0 = recording start) + zero or more screen-share video
 * segments (TrackEgress passthrough), each tagged with its startSec offset from t0.
 *
 * This runs AFTER the meeting (no live CPU pressure): it lays each screen segment on a
 * black canvas at its offset and muxes the audio. No screen ever shared → the audio file
 * itself is the artifact (plays as audio).
 */

export interface ScreenSegment {
  fileName: string; // file in RECORDINGS_DIR
  startSec: number; // offset from recording t0 (audio egress start)
  durationSec?: number | null;
}

export interface ComposeResult {
  ok: boolean;
  audioOnly?: boolean;
  outFile?: string; // fileName in RECORDINGS_DIR to register on the Recording row
  durationSec?: number;
  fileSize?: number;
  error?: string;
}

const CANVAS_W = 1280;
const CANVAS_H = 720;
const FPS = 15;

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => { stdout += d.toString(); });
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', (e) => resolve({ code: -1, stdout, stderr: stderr + String(e) }));
    p.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function probeDurationSec(file: string): Promise<number> {
  const r = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]);
  const d = parseFloat(r.stdout.trim());
  return Number.isFinite(d) ? d : 0;
}

export async function composeScreenAudio(opts: {
  audioFileName: string;
  screenSegments: ScreenSegment[];
  outFileName: string; // target .mp4 in RECORDINGS_DIR
}): Promise<ComposeResult> {
  const audioPath = path.join(RECORDINGS_DIR, opts.audioFileName);
  try {
    const audioDur = await probeDurationSec(audioPath);
    if (audioDur <= 0) return { ok: false, error: 'audio track has zero/unknown duration' };

    const segs = (opts.screenSegments || [])
      .filter((s) => s && s.fileName)
      .sort((a, b) => (a.startSec || 0) - (b.startSec || 0));

    // No screen was ever shared → the mixed-audio file IS the recording.
    if (segs.length === 0) {
      const size = (await stat(audioPath)).size;
      return { ok: true, audioOnly: true, outFile: opts.audioFileName, durationSec: Math.round(audioDur), fileSize: size };
    }

    const outPath = path.join(RECORDINGS_DIR, opts.outFileName);
    // inputs: [0] = mixed audio, [1..N] = screen segments
    const args: string[] = ['-y', '-i', audioPath];
    for (const s of segs) args.push('-i', path.join(RECORDINGS_DIR, s.fileName));

    // filtergraph: black base for the full duration; each segment scaled+letterboxed to
    // the canvas and delayed to its startSec, then overlaid in order. eof_action=pass so
    // the canvas (black) shows before/after each segment.
    const parts: string[] = [`color=c=black:s=${CANVAS_W}x${CANVAS_H}:r=${FPS}[bg]`];
    segs.forEach((s, i) => {
      const off = Math.max(0, s.startSec || 0);
      parts.push(
        `[${i + 1}:v]scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=decrease,` +
        `pad=${CANVAS_W}:${CANVAS_H}:(ow-iw)/2:(oh-ih)/2:color=black,` +
        `setpts=PTS-STARTPTS+${off}/TB[s${i}]`,
      );
    });
    let prev = 'bg';
    segs.forEach((_, i) => {
      const out = i === segs.length - 1 ? 'v' : `o${i}`;
      parts.push(`[${prev}][s${i}]overlay=eof_action=pass:shortest=0[${out}]`);
      prev = out;
    });

    args.push(
      '-filter_complex', parts.join(';'),
      '-map', '[v]', '-map', '0:a',
      '-t', audioDur.toFixed(3),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outPath,
    );

    const r = await run('ffmpeg', args);
    if (r.code !== 0) return { ok: false, error: `ffmpeg exit ${r.code}: ${r.stderr.slice(-600)}` };

    const size = (await stat(outPath)).size;
    return { ok: true, outFile: opts.outFileName, durationSec: Math.round(audioDur), fileSize: size };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
