import { NextRequest, NextResponse } from 'next/server';
import { WebhookReceiver } from 'livekit-server-sdk';
import { prisma } from '@/lib/prisma';
import { readConfig } from '@/lib/config';
import { startRoomRecording } from '@/lib/egress';

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const authHeader = req.headers.get('authorization') || '';

  let event;
  try {
    event = await receiver.receive(body, authHeader);
  } catch (e) {
    console.error('Webhook verification failed:', e);
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 401 });
  }

  // Egress (recording) status events — keyed by egressId, not by room.
  if (event.event === 'egress_started' || event.event === 'egress_updated' || event.event === 'egress_ended') {
    try {
      const info: any = (event as any).egressInfo;
      if (info?.egressId) {
        const data: any = {};
        if (event.event === 'egress_ended') {
          const fileRes = info.fileResults?.[0] || info.file;
          const failed = !!info.error || info.status === 4; // EGRESS_FAILED
          data.status = failed ? 'failed' : 'ready';
          if (fileRes) {
            if (fileRes.size != null) data.fileSize = BigInt(Math.round(Number(fileRes.size)));
            if (fileRes.duration != null) data.durationSec = Math.round(Number(fileRes.duration) / 1e9);
            if (fileRes.filename) {
              data.filePath = String(fileRes.filename);
              data.fileName = String(fileRes.filename).split('/').pop();
            }
          }
          if (!failed) {
            const cfg = await readConfig(['WS_RETENTION_DAYS']);
            const days = parseInt(cfg.WS_RETENTION_DAYS || '0', 10);
            if (days > 0) data.expiresAt = new Date(Date.now() + days * 86400000);
          }
        } else {
          data.status = 'processing';
        }
        await prisma.recording.updateMany({ where: { egressId: info.egressId }, data });
      }
    } catch (e) {
      console.error('egress webhook error:', e);
    }
    return NextResponse.json({ ok: true });
  }

  const roomName = event.room?.name;
  if (!roomName) {
    return NextResponse.json({ ok: true });
  }

  switch (event.event) {
    case 'room_started': {
      // Don't set to live here — wait for first participant_joined
      // LiveKit fires room_started when room is created, not when someone joins
      console.log(`Room started: ${roomName}`);
      break;
    }

    case 'room_finished': {
      // Only mark as ended if meeting was actually live (someone joined)
      const meetingsToEnd = await prisma.meeting.findMany({
        where: { livekitRoom: roomName, status: 'live' },
        select: { id: true },
      });
      if (meetingsToEnd.length > 0) {
        await prisma.meeting.updateMany({
          where: { livekitRoom: roomName, status: 'live' },
          data: { status: 'ended', endedAt: new Date() },
        });
        console.log(`Room finished (ended): ${roomName}`);
      } else {
        console.log(`Room finished (ignored — not live): ${roomName}`);
      }
      break;
    }

    case 'participant_joined': {
      const identity = event.participant?.identity;
      if (identity && !identity.startsWith('agent-') && !identity.startsWith('AJ_')) {
        const meeting = await prisma.meeting.findUnique({
          where: { livekitRoom: roomName },
        });
        if (meeting) {
          // Set meeting to live when first human participant joins
          if (meeting.status !== 'live') {
            await prisma.meeting.update({
              where: { id: meeting.id },
              data: { status: 'live' },
            });
            console.log(`Meeting set to live: ${meeting.id}`);

            // Auto-start recording if the workspace enables it (once per meeting)
            try {
              const cfg = await readConfig(['WS_RECORD_ALL']);
              if (cfg.WS_RECORD_ALL === 'true') {
                const existing = await prisma.recording.findFirst({
                  where: { meetingId: meeting.id, status: { in: ['processing', 'ready'] } },
                });
                if (!existing) {
                  const rec = await startRoomRecording(roomName);
                  if (rec) {
                    await prisma.recording.create({
                      data: {
                        meetingId: meeting.id,
                        egressId: rec.egressId,
                        fileName: rec.fileName,
                        filePath: rec.filePath,
                        status: 'processing',
                      },
                    });
                    console.log(`Recording started for ${meeting.id}: ${rec.egressId}`);
                  }
                }
              }
            } catch (e) {
              console.error('Auto-record start failed:', e);
            }
          }
          // Update join time if participant exists
          await prisma.meetingParticipant.updateMany({
            where: {
              meetingId: meeting.id,
              userId: identity,
              joinedAt: null,
            },
            data: { joinedAt: new Date() },
          });
        }
      }
      break;
    }

    case 'participant_left': {
      const identity = event.participant?.identity;
      if (identity && !identity.startsWith('agent-')) {
        const meeting = await prisma.meeting.findUnique({
          where: { livekitRoom: roomName },
        });
        if (meeting) {
          await prisma.meetingParticipant.updateMany({
            where: {
              meetingId: meeting.id,
              userId: identity,
              leftAt: null,
            },
            data: { leftAt: new Date() },
          });
        }
      }
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
