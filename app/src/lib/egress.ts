import { EgressClient, EncodedFileOutput, EncodedFileType, DirectFileOutput } from 'livekit-server-sdk';

const livekitHost = (process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_URL || 'ws://livekit:7880')
  .replace('wss://', 'https://')
  .replace('ws://', 'http://');
const apiKey = process.env.LIVEKIT_API_KEY!;
const apiSecret = process.env.LIVEKIT_API_SECRET!;

export const egressClient = new EgressClient(livekitHost, apiKey, apiSecret);

/** Recordings are written to this shared volume (mounted in both egress + app). */
export const RECORDINGS_DIR = '/recordings';

/**
 * Start a room-composite (grid) recording to an MP4 in the shared volume.
 * Returns the egressId + file paths, or null on failure.
 */
export async function startRoomRecording(
  roomName: string,
): Promise<{ egressId: string; filePath: string; fileName: string } | null> {
  try {
    const fileName = `rec-${roomName}-${Date.now()}.mp4`;
    const filePath = `${RECORDINGS_DIR}/${fileName}`;
    const fileOutput = new EncodedFileOutput({ fileType: EncodedFileType.MP4, filepath: filePath });
    const info = await egressClient.startRoomCompositeEgress(roomName, { file: fileOutput }, { layout: 'grid' });
    return { egressId: info.egressId, filePath, fileName };
  } catch (e) {
    console.error('startRoomRecording failed:', e);
    return null;
  }
}

/**
 * B2-lite — continuous MIXED audio of the whole room via an audio-only room-composite
 * egress. No video encode → light + stable (no tearing), and it's one continuous track
 * perfectly aligned to its own start, so the offline compose just muxes it under the
 * screen video. Output is OGG/Opus.
 */
export async function startAudioOnlyRecording(
  roomName: string,
): Promise<{ egressId: string; filePath: string; fileName: string } | null> {
  try {
    const fileName = `aud-${roomName}-${Date.now()}.ogg`;
    const filePath = `${RECORDINGS_DIR}/${fileName}`;
    const fileOutput = new EncodedFileOutput({ fileType: EncodedFileType.OGG, filepath: filePath });
    const info = await egressClient.startRoomCompositeEgress(roomName, { file: fileOutput }, { audioOnly: true });
    return { egressId: info.egressId, filePath, fileName };
  } catch (e) {
    console.error('startAudioOnlyRecording failed:', e);
    return null;
  }
}

/**
 * B2-lite — passthrough recording of ONE screen-share video track (no transcode,
 * ~0 CPU, no headless browser). The agent calls this when a screen-share track is
 * published and stops it when sharing ends; each call is one timeline segment.
 */
export async function startScreenTrackEgress(
  roomName: string,
  trackId: string,
): Promise<{ egressId: string; filePath: string; fileName: string } | null> {
  try {
    const fileName = `scr-${roomName}-${Date.now()}.mp4`;
    const filePath = `${RECORDINGS_DIR}/${fileName}`;
    const output = new DirectFileOutput({ filepath: filePath });
    const info = await egressClient.startTrackEgress(roomName, output, trackId);
    return { egressId: info.egressId, filePath, fileName };
  } catch (e) {
    console.error('startScreenTrackEgress failed:', e);
    return null;
  }
}

/** Stop an active egress (room-composite stops automatically on room end, but allow manual stop). */
export async function stopRecording(egressId: string): Promise<void> {
  try {
    await egressClient.stopEgress(egressId);
  } catch (e) {
    console.error('stopEgress failed:', e);
  }
}
