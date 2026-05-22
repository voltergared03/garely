import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const livekitHost = process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_URL || 'ws://livekit:7880';
const apiKey = process.env.LIVEKIT_API_KEY!;
const apiSecret = process.env.LIVEKIT_API_SECRET!;

export const roomService = new RoomServiceClient(
  livekitHost.replace('wss://', 'https://').replace('ws://', 'http://'),
  apiKey,
  apiSecret
);

export async function createLivekitToken(
  roomName: string,
  participantName: string,
  participantId: string,
  isHost: boolean = false
): Promise<string> {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantId,
    name: participantName,
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomCreate: isHost,
    roomAdmin: isHost,
  });

  return await token.toJwt();
}

export async function createRoom(roomName: string, maxParticipants = 20): Promise<void> {
  try {
    await roomService.createRoom({
      name: roomName,
      maxParticipants,
      emptyTimeout: 300,
    });
  } catch (e) {
    // Room might already exist
    console.log('Room creation:', e);
  }
}
