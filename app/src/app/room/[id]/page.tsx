'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/select';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useDataChannel,
  useTracks,
  useParticipants,
  useLocalParticipant,
  useRoomContext,
  TrackRefContext,
  VideoTrack,
  AudioTrack,
  useChat,
  TrackLoop,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, RoomEvent } from 'livekit-client';
import { Logo } from '@/components/ui/logo';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  Phone, MessageSquare, FileText, X, Languages,
  Send, MoreVertical, Users, UserPlus, Link2, Check,
  LogOut, Shield, Crown, Settings, Volume2, ChevronDown,
  Smile, StickyNote, Sparkles, Zap, Save,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────── */
interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  language: string;
  timestamp: number;
}

interface FloatingReaction {
  id: string;
  emoji: string;
  sender: string;
  x: number;
}

interface LiveAiNote {
  summary: string;
  decisions: string[];
  actionItems: string[];
  updatedAt: number;
}

interface DetectedActionItem {
  id: string;
  title: string;
  assignee: string | null;
  timestamp: number;
  dismissed: boolean;
}

const REACTIONS = ['👍', '👏', '😂', '❤️', '🔥', '✋', '🎉', '💡'];

/* ══════════════════════════════════════════════════════════
   ROOM CONTENT — rendered inside <LiveKitRoom>
   ══════════════════════════════════════════════════════════ */
function AdmissionPanel({ meetingId }: { meetingId: string }) {
  const [pending, setPending] = useState<{ id: string; guestName: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/admit`);
        if (res.ok) { const d = await res.json(); if (!cancelled) setPending(d.pending || []); }
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [meetingId]);

  const decide = async (rid: string, action: 'approve' | 'deny') => {
    setBusy(rid);
    try {
      await fetch(`/api/meetings/${meetingId}/admit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: rid, action }),
      });
      setPending((p) => p.filter((x) => x.id !== rid));
    } catch { /* ignore */ } finally { setBusy(null); }
  };

  if (pending.length === 0) return null;
  return (
    <div style={{ position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', flexDirection: 'column', gap: 8, width: 360, maxWidth: '90vw' }}>
      {pending.map((p) => (
        <div key={p.id} style={{ background: 'rgba(20,22,28,.97)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 12px 40px rgba(0,0,0,.5)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>Гість хоче приєднатися</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.guestName}</div>
          </div>
          <button onClick={() => decide(p.id, 'deny')} disabled={busy === p.id} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 13 }}>Відхилити</button>
          <button onClick={() => decide(p.id, 'approve')} disabled={busy === p.id} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Впустити</button>
        </div>
      ))}
    </div>
  );
}

function RoomContent({ meetingId, joinToken, isGuest, canKick, openTranscript }: {
  meetingId: string; joinToken?: string; isGuest?: boolean; canKick?: boolean; openTranscript?: boolean;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const router = useRouter();

  /* ── sidebar state ─────────────────── */
  const [sidePanel, setSidePanel] = useState<'chat' | 'transcript' | 'participants' | 'notes' | 'ai-notes' | null>(openTranscript ? 'transcript' : null);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedCam, setSelectedCam] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);

  const shareLink = joinToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${joinToken}`
    : typeof window !== 'undefined' ? window.location.href : '';

  const copyShareLink = useCallback(() => {
    navigator.clipboard.writeText(shareLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [shareLink]);

  /* ── kick participant ──────────────── */
  const kickParticipant = useCallback(async (identity: string) => {
    if (!confirm('Видалити цього учасника з мітингу?')) return;
    setKickingId(identity);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIdentity: identity }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Не вдалося видалити учасника');
      }
    } catch {
      alert('Помилка з\'єднання');
    } finally {
      setKickingId(null);
    }
  }, [meetingId]);

  /* ── device management ────────────── */
  const enumerateDevices = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setDevices(devs);
      const curMic = localParticipant.getTrackPublication(Track.Source.Microphone);
      const curCam = localParticipant.getTrackPublication(Track.Source.Camera);
      if (curMic?.track) {
        const settings = curMic.track.mediaStreamTrack?.getSettings();
        if (settings?.deviceId && !selectedMic) setSelectedMic(settings.deviceId);
      }
      if (curCam?.track) {
        const settings = curCam.track.mediaStreamTrack?.getSettings();
        if (settings?.deviceId && !selectedCam) setSelectedCam(settings.deviceId);
      }
    } catch (e) { console.error('Device enum error:', e); }
  }, [localParticipant, selectedMic, selectedCam]);

  const switchMic = useCallback(async (deviceId: string) => {
    setSelectedMic(deviceId);
    try {
      await room.switchActiveDevice('audioinput', deviceId);
    } catch (e) { console.error('Switch mic error:', e); }
  }, [room]);

  const switchCam = useCallback(async (deviceId: string) => {
    setSelectedCam(deviceId);
    try {
      await room.switchActiveDevice('videoinput', deviceId);
    } catch (e) { console.error('Switch cam error:', e); }
  }, [room]);

  const switchSpeaker = useCallback(async (deviceId: string) => {
    setSelectedSpeaker(deviceId);
    try {
      await room.switchActiveDevice('audiooutput', deviceId);
    } catch (e) { console.error('Switch speaker error:', e); }
  }, [room]);

  /* ── chat ───────────────────────────── */
  const { chatMessages, send: sendChat, isSending } = useChat();
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  const handleSendChat = () => {
    const txt = chatInput.trim();
    if (!txt) return;
    sendChat(txt);
    setChatInput('');
  };

  /* ── transcription ─────────────────── */
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const interimRef = useRef<Record<string, string>>({});

  const onTranscript = useCallback((raw: { payload: Uint8Array }) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(raw.payload));
      if (msg.type !== 'transcription') return;
      if (!msg.isFinal) {
        interimRef.current[msg.speaker] = msg.text;
        setTranscripts(p => [...p]);
        return;
      }
      delete interimRef.current[msg.speaker];
      setTranscripts(p => [...p, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        speaker: msg.speaker, text: msg.text,
        language: msg.language || 'uk',
        timestamp: msg.timestamp || Date.now() / 1000,
      }].slice(-200));
    } catch { /* skip */ }
  }, []);

  useDataChannel('transcription', onTranscript);

  useEffect(() => {
    if (transcriptScrollRef.current) transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
  }, [transcripts]);

  /* ── reactions ─────────────────────── */
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const onReaction = useCallback((raw: { payload: Uint8Array }) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(raw.payload));
      if (msg.type !== 'reaction') return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const x = 10 + Math.random() * 80;
      setFloatingReactions(prev => [...prev, { id, emoji: msg.emoji, sender: msg.sender, x }]);
      setTimeout(() => {
        setFloatingReactions(prev => prev.filter(r => r.id !== id));
      }, 3000);
    } catch { /* skip */ }
  }, []);

  useDataChannel('reactions', onReaction);

  const sendReaction = useCallback(async (emoji: string) => {
    try {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({
          type: 'reaction',
          emoji,
          sender: localParticipant.name || localParticipant.identity,
        })),
        { topic: 'reactions' },
      );
    } catch { /* skip */ }
    setShowReactionPicker(false);
  }, [room, localParticipant]);

  /* ── collaborative notes ──────────── */
  const [notesContent, setNotesContent] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesLastSaved, setNotesLastSaved] = useState<string | null>(null);
  const notesTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load notes on mount
  useEffect(() => {
    if (!meetingId) return;
    fetch(`/api/meetings/${meetingId}/notes`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setNotesContent(data.content || ''); })
      .catch(() => {});
  }, [meetingId]);

  // Broadcast note changes via data channel
  const onRemoteNotes = useCallback((raw: { payload: Uint8Array }) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(raw.payload));
      if (msg.type !== 'notes-update') return;
      setNotesContent(msg.content);
    } catch { /* skip */ }
  }, []);

  useDataChannel('notes', onRemoteNotes);

  const handleNotesChange = useCallback((value: string) => {
    setNotesContent(value);
    // Broadcast to others
    try {
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: 'notes-update', content: value })),
        { topic: 'notes' },
      );
    } catch { /* skip */ }
    // Auto-save with debounce
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(async () => {
      setNotesSaving(true);
      try {
        await fetch(`/api/meetings/${meetingId}/notes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: value }),
        });
        setNotesLastSaved(new Date().toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' }));
      } catch { /* skip */ }
      setNotesSaving(false);
    }, 1500);
  }, [meetingId, room, localParticipant]);

  /* ── live AI notes ────────────────── */
  const [liveAiNotes, setLiveAiNotes] = useState<LiveAiNote | null>(null);

  const onAiNotes = useCallback((raw: { payload: Uint8Array }) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(raw.payload));
      if (msg.type !== 'ai-notes') return;
      setLiveAiNotes({
        summary: msg.summary || '',
        decisions: msg.decisions || [],
        actionItems: msg.action_items || [],
        updatedAt: Date.now(),
      });
    } catch { /* skip */ }
  }, []);

  useDataChannel('ai-notes', onAiNotes);

  /* ── live action item detection ───── */
  const [detectedActions, setDetectedActions] = useState<DetectedActionItem[]>([]);

  const onActionDetected = useCallback((raw: { payload: Uint8Array }) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(raw.payload));
      if (msg.type !== 'action-detected') return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setDetectedActions(prev => [...prev, {
        id, title: msg.title, assignee: msg.assignee || null,
        timestamp: Date.now(), dismissed: false,
      }]);
      // Auto-dismiss after 15 seconds
      setTimeout(() => {
        setDetectedActions(prev => prev.filter(a => a.id !== id));
      }, 15000);
    } catch { /* skip */ }
  }, []);

  useDataChannel('action-items', onActionDetected);

  const dismissAction = useCallback((id: string) => {
    setDetectedActions(prev => prev.filter(a => a.id !== id));
  }, []);

  /* ── tracks ────────────────────────── */
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  const visibleCameraTracks = cameraTracks.filter(t => {
    const identity = t.participant?.identity || '';
    return !identity.startsWith('agent-') && !identity.startsWith('AJ_');
  });

  /* ── local toggles ─────────────────── */
  const [micOn, setMicOn] = useState(!localParticipant.isMicrophoneEnabled ? false : true);
  const [camOn, setCamOn] = useState(!localParticipant.isCameraEnabled ? false : true);
  const [screenOn, setScreenOn] = useState(false);

  useEffect(() => {
    setMicOn(localParticipant.isMicrophoneEnabled ?? false);
    setCamOn(localParticipant.isCameraEnabled ?? false);
  }, [localParticipant.isMicrophoneEnabled, localParticipant.isCameraEnabled]);

  const toggleMic = async () => {
    await localParticipant.setMicrophoneEnabled(!micOn);
    setMicOn(!micOn);
  };
  const toggleCam = async () => {
    await localParticipant.setCameraEnabled(!camOn);
    setCamOn(!camOn);
  };
  const toggleScreen = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!screenOn);
      setScreenOn(!screenOn);
    } catch { /* user cancelled */ }
  };
  const leaveMeeting = () => {
    room.disconnect();
    if (isGuest) router.push('/');
    else if (meetingId === 'quick') router.push('/');
    else router.push(`/meetings/${meetingId}/report`);
  };

  /* ── elapsed time ──────────────────── */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  };

  /* ── human participants ──────────── */
  const humanParticipants = participants.filter(p => {
    const id = p.identity || '';
    return !id.startsWith('agent-') && !id.startsWith('AJ_');
  });
  const humanCount = humanParticipants.length;

  /* ── screen-share active? ──────────── */
  const hasScreenShare = screenTracks.length > 0;
  const mainScreen = screenTracks[0];

  /* ── grid columns calculation ─────── */
  const tileCount = visibleCameraTracks.length;
  const gridCols = tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : tileCount <= 9 ? 3 : 4;

  /* ── language flags ────────────────── */
  const langFlag: Record<string, string> = { uk: '🇺🇦', en: '🇬🇧', ru: '🇷🇺' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111317' }}>
      <RoomAudioRenderer />
      {!isGuest && <AdmissionPanel meetingId={meetingId} />}

      {/* ── Floating Reactions ──────────── */}
      {floatingReactions.map(r => (
        <div key={r.id} style={{
          position: 'fixed', left: `${r.x}%`, bottom: 100, zIndex: 300,
          pointerEvents: 'none',
          animation: 'reactionFloat 3s ease-out forwards',
        }}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: 40 }}>{r.emoji}</span>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,.7)',
              background: 'rgba(0,0,0,.5)', padding: '2px 8px',
              borderRadius: 6, marginTop: 2, whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
            }}>{r.sender}</div>
          </div>
        </div>
      ))}

      {/* ── Action Item Toasts ──────────── */}
      <div style={{
        position: 'fixed', top: 70, right: 20, zIndex: 250,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 340, pointerEvents: 'auto',
      }}>
        {detectedActions.map(action => (
          <div key={action.id} style={{
            display: 'flex', gap: 10, padding: '12px 14px',
            background: 'rgba(30, 32, 40, 0.95)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(167,139,250,.3)', borderRadius: 14,
            boxShadow: '0 8px 30px rgba(0,0,0,.4)',
            animation: 'fadeIn .2s ease',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'rgba(167,139,250,.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={16} style={{ color: '#a78bfa' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#a78bfa', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Action Item
              </div>
              <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.4 }}>
                {action.title}
              </div>
              {action.assignee && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 3 }}>
                  → {action.assignee}
                </div>
              )}
            </div>
            <button onClick={() => dismissAction(action.id)} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,.3)',
              cursor: 'pointer', padding: 2, flexShrink: 0, alignSelf: 'flex-start',
            }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Share popup - fixed overlay */}
      {showSharePopup && (
        <div onClick={() => setShowSharePopup(false)} style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: 420, padding: '24px 22px',
            background: '#1e2028', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Запросити учасників</div>
              <button onClick={() => setShowSharePopup(false)} style={{
                width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 16, lineHeight: 1.5 }}>
              Поділіться цим посиланням — гості зможуть приєднатися без реєстрації
            </div>
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: '10px 14px', background: 'rgba(255,255,255,.06)',
              borderRadius: 12, border: '1px solid rgba(255,255,255,.08)', marginBottom: 12,
            }}>
              <Link2 size={15} style={{ color: 'rgba(255,255,255,.4)', flexShrink: 0 }} />
              <div style={{
                flex: 1, fontSize: 13, color: 'rgba(255,255,255,.7)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontFamily: 'var(--mono)',
              }}>{shareLink}</div>
            </div>
            <button onClick={() => { copyShareLink(); }} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: linkCopied ? '#22c55e' : '#3b82f6', color: '#fff',
              fontSize: 14, fontWeight: 600, transition: 'background .15s',
            }}>
              {linkCopied ? <><Check size={15} /> Посилання скопійовано!</> : <><Link2 size={15} /> Копіювати посилання</>}
            </button>
          </div>
        </div>
      )}

      {/* ── TOP BAR ──────────────────────── */}
      <div className="room-top-bar" style={{
        flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '8px 16px', gap: 12,
        background: '#1a1d23', borderBottom: '1px solid rgba(255,255,255,.06)',
      }}>
        <Logo />
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500,
          background: 'rgba(239,68,68,.15)', color: '#fca5a5',
          border: '1px solid rgba(239,68,68,.3)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: '#ef4444',
            animation: 'pulseDot 1.6s ease-in-out infinite', display: 'inline-block',
          }} />
          REC
        </span>
        <span className="room-timer" style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', fontFamily: 'monospace' }}>
          {fmtTime(elapsed)}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
          <Users size={14} /> {humanCount}
        </div>
      </div>

      {/* ── MAIN AREA (video + sidebar) ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ── Video area ─────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          <div style={{ flex: 1, padding: 8, display: 'flex', gap: 8, minHeight: 0, overflow: 'hidden' }}>
            {hasScreenShare ? (
              <div style={{ display: 'flex', flex: 1, gap: 8, minHeight: 0 }}>
                <div style={{
                  flex: 1, borderRadius: 12, overflow: 'hidden', background: '#000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', minWidth: 0,
                }}>
                  {mainScreen?.publication?.track && (
                    <VideoTrack trackRef={mainScreen}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  )}
                  <div style={{
                    position: 'absolute', bottom: 10, left: 12,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)',
                    fontSize: 12, color: '#fff',
                  }}>
                    📺 {mainScreen?.participant?.name || 'Демонстрація'}
                  </div>
                </div>
                <div className="room-filmstrip" style={{
                  width: 180, display: 'flex', flexDirection: 'column', gap: 6,
                  overflowY: 'auto', flexShrink: 0,
                }}>
                  {visibleCameraTracks.map(track => (
                    <ParticipantTile key={track.participant.sid} track={track} small />
                  ))}
                </div>
              </div>
            ) : (
              <div className="room-video-grid" style={{
                flex: 1, display: 'grid',
                gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                gridAutoRows: tileCount <= 2 ? '1fr' : 'auto',
                gap: 10,
                alignContent: tileCount <= 2 ? 'stretch' : 'center',
                alignItems: 'center', maxHeight: '100%',
              }}>
                {visibleCameraTracks.map(track => (
                  <ParticipantTile key={track.participant.sid} track={track} fill={tileCount <= 2} />
                ))}
              </div>
            )}
          </div>

          {/* ── CONTROL BAR ──────────────── */}
          <div className="room-controls" style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '10px 16px',
            background: '#1a1d23', borderTop: '1px solid rgba(255,255,255,.06)',
          }}>
            <ControlBtn active={micOn} onClick={toggleMic} danger={!micOn}
              icon={micOn ? <Mic size={20} /> : <MicOff size={20} />} label={micOn ? 'Мікрофон' : 'Увімкнути'} />
            <ControlBtn active={camOn} onClick={toggleCam} danger={!camOn}
              icon={camOn ? <Video size={20} /> : <VideoOff size={20} />} label={camOn ? 'Камера' : 'Увімкнути'} />
            <ControlBtn active={screenOn} onClick={toggleScreen}
              icon={screenOn ? <MonitorOff size={20} /> : <Monitor size={20} />} label="Екран" className="room-screen-btn" />

            <div className="room-controls-divider" style={{ width: 1, height: 28, background: 'rgba(255,255,255,.1)', margin: '0 2px' }} />

            {!isGuest && (
              <ControlBtn active={showSharePopup} onClick={() => setShowSharePopup(!showSharePopup)}
                icon={<UserPlus size={20} />} label="Запросити" />
            )}

            {/* Participants panel */}
            <ControlBtn active={sidePanel === 'participants'}
              onClick={() => setSidePanel(sidePanel === 'participants' ? null : 'participants')}
              icon={<Users size={20} />} label="Учасники"
              badge={humanCount > 1 ? humanCount : undefined} />

            <ControlBtn active={sidePanel === 'chat'} onClick={() => setSidePanel(sidePanel === 'chat' ? null : 'chat')}
              icon={<MessageSquare size={20} />} label="Чат"
              badge={chatMessages.length > 0 ? chatMessages.length : undefined} />
            <ControlBtn active={sidePanel === 'transcript'} onClick={() => setSidePanel(sidePanel === 'transcript' ? null : 'transcript')}
              icon={<FileText size={20} />} label="Текст" />

            {/* Notes panel */}
            <ControlBtn active={sidePanel === 'notes'} onClick={() => setSidePanel(sidePanel === 'notes' ? null : 'notes')}
              icon={<StickyNote size={20} />} label="Нотатки" />

            {/* AI Notes panel */}
            <ControlBtn active={sidePanel === 'ai-notes'} onClick={() => setSidePanel(sidePanel === 'ai-notes' ? null : 'ai-notes')}
              icon={<Sparkles size={20} />} label="AI" />

            {/* Reactions */}
            <div style={{ position: 'relative' }}>
              <ControlBtn active={showReactionPicker} onClick={() => setShowReactionPicker(!showReactionPicker)}
                icon={<Smile size={20} />} label="Реакції" />
              {showReactionPicker && (
                <>
                  <div onClick={() => setShowReactionPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
                    padding: '8px 10px', zIndex: 100,
                    background: '#1e2028', border: '1px solid rgba(255,255,255,.12)',
                    borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,.6)',
                    display: 'flex', gap: 4,
                  }}>
                    {REACTIONS.map(emoji => (
                      <button key={emoji} onClick={() => sendReaction(emoji)} style={{
                        width: 40, height: 40, borderRadius: 10, border: 'none',
                        background: 'rgba(255,255,255,.04)', cursor: 'pointer',
                        fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .12s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.12)'; e.currentTarget.style.transform = 'scale(1.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.04)'; e.currentTarget.style.transform = 'scale(1)'; }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Device picker */}
            <div style={{ position: 'relative' }}>
              <ControlBtn active={showDevicePicker}
                onClick={() => { enumerateDevices(); setShowDevicePicker(!showDevicePicker); }}
                icon={<Settings size={20} />} label="Пристрої" />
              {showDevicePicker && (
                <>
                  <div onClick={() => setShowDevicePicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
                    width: 300, maxWidth: 'calc(100vw - 24px)', padding: '14px 16px', zIndex: 100,
                    background: '#1e2028', border: '1px solid rgba(255,255,255,.12)',
                    borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,.6)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Пристрої</div>
                    <RoomDeviceSelect label="Мікрофон" icon={<Mic size={13} />}
                      devices={devices.filter(d => d.kind === 'audioinput')}
                      value={selectedMic} onChange={switchMic} />
                    <RoomDeviceSelect label="Камера" icon={<Video size={13} />}
                      devices={devices.filter(d => d.kind === 'videoinput')}
                      value={selectedCam} onChange={switchCam} />
                    <RoomDeviceSelect label="Динаміки" icon={<Volume2 size={13} />}
                      devices={devices.filter(d => d.kind === 'audiooutput')}
                      value={selectedSpeaker} onChange={switchSpeaker} />
                  </div>
                </>
              )}
            </div>

            <div className="room-controls-divider" style={{ width: 1, height: 28, background: 'rgba(255,255,255,.1)', margin: '0 2px' }} />

            <button className="room-leave-btn" onClick={leaveMeeting} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', borderRadius: 24, cursor: 'pointer',
              background: '#ef4444', color: '#fff', border: 'none',
              fontSize: 14, fontWeight: 600, transition: 'background .15s', flexShrink: 0,
            }}>
              <Phone size={18} style={{ transform: 'rotate(135deg)' }} />
              <span className="room-leave-label">Вийти</span>
            </button>
          </div>
        </div>

        {/* ── SIDE PANEL ─────────────────── */}
        {sidePanel && (
          <div className="room-side-panel" style={{
            width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column',
            background: '#1a1d23', borderLeft: '1px solid rgba(255,255,255,.08)',
          }}>
            <div style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,.08)', flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                {sidePanel === 'chat' ? 'Чат' : sidePanel === 'transcript' ? 'Транскрипція' : sidePanel === 'participants' ? 'Учасники' : sidePanel === 'notes' ? 'Нотатки' : 'AI Нотатки'}
              </span>
              <button onClick={() => setSidePanel(null)} style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,.4)',
                cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6,
              }}><X size={16} /></button>
            </div>

            {/* ── Participants panel ── */}
            {sidePanel === 'participants' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', minHeight: 0 }}>
                {humanParticipants.map(p => {
                  const isLocal = p.isLocal;
                  const identity = p.identity || '';
                  const isGuestUser = identity.startsWith('guest-');
                  const isMicEnabled = p.isMicrophoneEnabled;
                  const isCamEnabled = p.isCameraEnabled;

                  return (
                    <div key={p.sid} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px',
                      transition: 'background .1s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: isGuestUser ? '#6366f1' : '#3b82f6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0,
                      }}>
                        {(p.name || identity || 'U')[0]?.toUpperCase()}
                      </div>

                      {/* Name + badge */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 13, fontWeight: 600, color: '#fff',
                        }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name || identity}
                          </span>
                          {isLocal && (
                            <span style={{
                              fontSize: 10, padding: '1px 5px', borderRadius: 4,
                              background: 'rgba(59,130,246,.2)', color: '#93c5fd',
                            }}>Ви</span>
                          )}
                          {isGuestUser && (
                            <span style={{
                              fontSize: 10, padding: '1px 5px', borderRadius: 4,
                              background: 'rgba(99,102,241,.2)', color: '#a5b4fc',
                            }}>Гість</span>
                          )}
                        </div>
                        {/* Media status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          {isMicEnabled ? (
                            <Mic size={11} style={{ color: 'rgba(255,255,255,.35)' }} />
                          ) : (
                            <MicOff size={11} style={{ color: '#fca5a5' }} />
                          )}
                          {isCamEnabled ? (
                            <Video size={11} style={{ color: 'rgba(255,255,255,.35)' }} />
                          ) : (
                            <VideoOff size={11} style={{ color: '#fca5a5' }} />
                          )}
                        </div>
                      </div>

                      {/* Kick button — only for admin/host, not for self */}
                      {canKick && !isLocal && (
                        <button
                          onClick={() => kickParticipant(identity)}
                          disabled={kickingId === identity}
                          title="Видалити з мітингу"
                          style={{
                            width: 32, height: 32, borderRadius: 8,
                            border: '1px solid rgba(239,68,68,.2)',
                            background: kickingId === identity ? 'rgba(239,68,68,.2)' : 'transparent',
                            color: '#fca5a5', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all .15s', flexShrink: 0,
                            opacity: kickingId === identity ? 0.5 : 1,
                          }}
                          onMouseEnter={e => { if (kickingId !== identity) e.currentTarget.style.background = 'rgba(239,68,68,.15)'; }}
                          onMouseLeave={e => { if (kickingId !== identity) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <LogOut size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {humanCount === 0 && (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.25)', fontSize: 13, marginTop: 40 }}>
                    <Users size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                    <div>Немає учасників</div>
                  </div>
                )}

                {canKick && humanCount > 1 && (
                  <div style={{
                    margin: '16px 16px 0', padding: '10px 12px',
                    background: 'rgba(255,255,255,.03)',
                    borderRadius: 10, border: '1px solid rgba(255,255,255,.06)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 11.5, color: 'rgba(255,255,255,.35)',
                  }}>
                    <Shield size={13} style={{ flexShrink: 0 }} />
                    <span>Ви можете видаляти учасників з мітингу</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Chat panel ── */}
            {sidePanel === 'chat' && (
              <>
                <div ref={chatScrollRef} style={{
                  flex: 1, overflowY: 'auto', padding: '12px 14px',
                  display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0,
                }}>
                  {chatMessages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.25)', fontSize: 13, marginTop: 40 }}>
                      <MessageSquare size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                      <div>Повідомлень поки немає</div>
                    </div>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#60a5fa' }}>
                          {m.from?.name || m.from?.identity || 'Ви'}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,.25)' }}>
                          {new Date(m.timestamp).toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', lineHeight: 1.45 }}>{m.message}</div>
                    </div>
                  ))}
                </div>
                <div style={{
                  flexShrink: 0, padding: '10px 12px',
                  borderTop: '1px solid rgba(255,255,255,.08)',
                  display: 'flex', gap: 8,
                }}>
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                    placeholder="Написати повідомлення..."
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                      color: '#fff', fontSize: 13, outline: 'none',
                    }} />
                  <button onClick={handleSendChat} disabled={isSending || !chatInput.trim()} style={{
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                    background: chatInput.trim() ? '#3b82f6' : 'rgba(255,255,255,.06)',
                    color: '#fff', border: 'none', display: 'flex', alignItems: 'center',
                    opacity: chatInput.trim() ? 1 : 0.4,
                  }}><Send size={16} /></button>
                </div>
              </>
            )}

            {/* ── Transcript panel ── */}
            {sidePanel === 'transcript' && (
              <div ref={transcriptScrollRef} style={{
                flex: 1, overflowY: 'auto', padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0,
              }}>
                {transcripts.length === 0 && Object.keys(interimRef.current).length === 0 && (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.25)', fontSize: 13, marginTop: 40, lineHeight: 1.6 }}>
                    <Languages size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                    <div>Транскрипція з&apos;явиться,</div>
                    <div>коли учасники почнуть говорити</div>
                  </div>
                )}
                {transcripts.map(e => (
                  <div key={e.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{e.speaker}</span>
                      <span style={{ fontSize: 10, opacity: 0.5 }}>{langFlag[e.language] || '🌐'}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.5 }}>{e.text}</div>
                  </div>
                ))}
                {Object.entries(interimRef.current).map(([speaker, text]) => (
                  <div key={`int-${speaker}`} style={{ opacity: 0.45 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>{speaker} <span style={{ fontSize: 9, color: '#93c5fd' }}>...</span></div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', fontStyle: 'italic', lineHeight: 1.5 }}>{text}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Notes panel ── */}
            {sidePanel === 'notes' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{
                  flexShrink: 0, padding: '8px 14px',
                  display: 'flex', alignItems: 'center', gap: 6,
                  borderBottom: '1px solid rgba(255,255,255,.06)',
                  fontSize: 11, color: 'rgba(255,255,255,.35)',
                }}>
                  {notesSaving ? (
                    <><Save size={11} style={{ animation: 'spin .8s linear infinite' }} /> Збереження...</>
                  ) : notesLastSaved ? (
                    <><Check size={11} /> Збережено о {notesLastSaved}</>
                  ) : (
                    <><StickyNote size={11} /> Спільні нотатки для всіх учасників</>
                  )}
                </div>
                <textarea
                  value={notesContent}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder="Записуйте ключові моменти зустрічі тут...&#10;&#10;Нотатки синхронізуються для всіх учасників."
                  style={{
                    flex: 1, resize: 'none', border: 'none', outline: 'none',
                    padding: '14px 14px', fontSize: 13, lineHeight: 1.6,
                    background: 'transparent', color: 'rgba(255,255,255,.85)',
                    fontFamily: 'inherit', minHeight: 0,
                  }}
                />
              </div>
            )}

            {/* ── AI Notes panel ── */}
            {sidePanel === 'ai-notes' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!liveAiNotes ? (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.25)', fontSize: 13, marginTop: 40, lineHeight: 1.6 }}>
                    <Sparkles size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                    <div>AI аналіз з&apos;явиться</div>
                    <div>після кількох хвилин розмови</div>
                    <div style={{ fontSize: 11, marginTop: 12, color: 'rgba(255,255,255,.15)' }}>
                      Оновлюється автоматично
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    {liveAiNotes.summary && (
                      <div>
                        <div style={{
                          fontSize: 10, fontWeight: 600, color: '#60a5fa',
                          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <Sparkles size={11} /> Резюме
                        </div>
                        <div style={{
                          fontSize: 13, color: 'rgba(255,255,255,.75)', lineHeight: 1.6,
                          padding: '10px 12px', background: 'rgba(59,130,246,.06)',
                          borderRadius: 10, border: '1px solid rgba(59,130,246,.1)',
                        }}>
                          {liveAiNotes.summary}
                        </div>
                      </div>
                    )}

                    {/* Decisions */}
                    {liveAiNotes.decisions.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: 10, fontWeight: 600, color: '#10b981',
                          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <Check size={11} /> Рішення
                        </div>
                        {liveAiNotes.decisions.map((d, i) => (
                          <div key={i} style={{
                            fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.5,
                            padding: '6px 10px', marginBottom: 4,
                            borderLeft: '2px solid rgba(16,185,129,.4)',
                            paddingLeft: 10,
                          }}>
                            {d}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Items */}
                    {liveAiNotes.actionItems.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: 10, fontWeight: 600, color: '#a78bfa',
                          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                          <Zap size={11} /> Action Items
                        </div>
                        {liveAiNotes.actionItems.map((a, i) => (
                          <div key={i} style={{
                            fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.5,
                            padding: '6px 10px', marginBottom: 4,
                            borderLeft: '2px solid rgba(167,139,250,.4)',
                            paddingLeft: 10,
                          }}>
                            {a}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Updated timestamp */}
                    <div style={{
                      fontSize: 10, color: 'rgba(255,255,255,.2)', textAlign: 'center',
                      marginTop: 8,
                    }}>
                      Оновлено {new Date(liveAiNotes.updatedAt).toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes reactionFloat {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          50% { opacity: 1; transform: translateY(-120px) scale(1.15); }
          100% { opacity: 0; transform: translateY(-240px) scale(0.8); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .room-controls { gap: 4px !important; padding: 8px 8px !important; }
          .room-controls-divider { display: none !important; }
          .room-leave-btn { padding: 10px 14px !important; }
          .room-leave-label { display: none !important; }
          .room-side-panel { position: fixed !important; inset: 0 !important; width: 100% !important; z-index: 100; }
          .room-filmstrip { width: 120px !important; }
          .room-top-bar { padding: 6px 10px !important; gap: 8px !important; }
          .room-screen-btn { display: none !important; }
          .room-video-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .room-controls { gap: 2px !important; padding: 6px 4px !important; }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PARTICIPANT TILE
   ══════════════════════════════════════════════════════════ */
function ParticipantTile({ track, small, fill }: { track: any; small?: boolean; fill?: boolean }) {
  const p = track.participant;
  const isCamOn = p.isCameraEnabled;
  const isMicOn = p.isMicrophoneEnabled;
  const isSpeaking = p.isSpeaking;
  const isLocal = p.isLocal;

  return (
    <div style={{
      position: 'relative', borderRadius: small ? 10 : 14, overflow: 'hidden',
      background: '#22252b',
      ...(fill ? { width: '100%', height: '100%' } : { aspectRatio: '16/9' }),
      border: isSpeaking ? '2px solid #3b82f6' : '2px solid transparent',
      transition: 'border-color .2s', maxHeight: small ? 140 : undefined,
    }}>
      {isCamOn && track.publication?.track ? (
        <VideoTrack trackRef={track} style={{
          width: '100%', height: '100%', objectFit: 'cover',
          position: 'absolute', inset: 0,
          ...(isLocal ? { transform: 'scaleX(-1)' } : {}),
        }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(145deg, #2a2d35 0%, #1a1d25 100%)',
        }}>
          <div style={{
            width: small ? 48 : 80, height: small ? 48 : 80,
            borderRadius: '50%', background: '#3b82f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: small ? 20 : 32, fontWeight: 700, color: '#fff',
            boxShadow: '0 4px 20px rgba(59,130,246,.3)',
          }}>
            {(p.name || p.identity || 'U')[0]?.toUpperCase()}
          </div>
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: small ? '6px 8px' : '8px 12px',
        background: 'linear-gradient(transparent, rgba(0,0,0,.65))',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {!isMicOn && (
          <span style={{
            width: 22, height: 22, borderRadius: 6,
            background: 'rgba(239,68,68,.25)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}><MicOff size={12} style={{ color: '#fca5a5' }} /></span>
        )}
        <span style={{
          fontSize: small ? 11 : 13, color: '#fff', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {p.name || p.identity}{isLocal ? ' (Ви)' : ''}
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ROOM DEVICE SELECT
   ══════════════════════════════════════════════════════════ */
function RoomDeviceSelect({ label, icon, devices, value, onChange }: {
  label: string; icon: React.ReactNode; devices: MediaDeviceInfo[];
  value: string; onChange: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
        {icon} {label}
      </div>
      <Select
        value={value}
        onChange={onChange}
        placeholder="Не знайдено"
        style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', padding: '7px 9px', fontSize: 12.5 }}
        options={devices.map(d => ({ value: d.deviceId, label: d.label || `Device ${d.deviceId.slice(0, 6)}` }))}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CONTROL BUTTON
   ══════════════════════════════════════════════════════════ */
function ControlBtn({ active, onClick, icon, label, danger, badge, className }: {
  active: boolean; onClick: () => void; icon: React.ReactNode;
  label: string; danger?: boolean; badge?: number; className?: string;
}) {
  return (
    <button onClick={onClick} title={label} className={"room-ctrl-btn" + (className ? " " + className : "")} style={{
      position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '8px 14px', borderRadius: 12, cursor: 'pointer',
      background: danger ? 'rgba(239,68,68,.15)' : active ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.04)',
      color: danger ? '#fca5a5' : active ? '#fff' : 'rgba(255,255,255,.6)',
      border: danger ? '1px solid rgba(239,68,68,.3)' : '1px solid rgba(255,255,255,.08)',
      transition: 'all .15s', minWidth: 0, flexShrink: 0,
    }}>
      {icon}
      <span className="room-ctrl-label" style={{ fontSize: 10, fontWeight: 500 }}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span style={{
          position: 'absolute', top: 2, right: 6,
          width: 16, height: 16, borderRadius: '50%',
          background: '#3b82f6', color: '#fff',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge > 9 ? '9+' : badge}</span>
      )}
      <style>{`
        @media (max-width: 768px) {
          .room-ctrl-btn { width: 44px !important; height: 44px !important; padding: 0 !important; border-radius: 50% !important; justify-content: center !important; min-width: 44px !important; }
          .room-ctrl-label { display: none !important; }
        }
      `}</style>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */
export default function MeetingRoomPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const startWithVideo = searchParams.get('cam') !== '0';
  const startWithAudio = searchParams.get('mic') !== '0';
  const startWithTranscript = searchParams.get('tx') === '1';
  const guestName = searchParams.get('guest') || '';
  const micDeviceId = searchParams.get('micId') || '';
  const camDeviceId = searchParams.get('camId') || '';
  const spkDeviceId = searchParams.get('spkId') || '';
  const router = useRouter();
  const [token, setToken] = useState('');
  const [wsUrl, setWsUrl] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [meetingIdReal, setMeetingIdReal] = useState('');
  const [canKick, setCanKick] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const guest = guestName;
    let cancelled = false;
    let reqId: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function fetchToken() {
      try {
        const body: any = {};
        if (guest) { body.guestName = guest; if (reqId) body.requestId = reqId; }

        const res = await fetch(`/api/meetings/${id}/join-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        // 202 = waiting room: guest pending host approval
        if (res.status === 202) {
          const data = await res.json().catch(() => ({}));
          reqId = data.requestId;
          if (!cancelled) { setWaiting(true); timer = setTimeout(fetchToken, 3000); }
          return;
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.denied ? 'Доступ відхилено організатором' : (errData.error || 'Не вдалося отримати токен'));
        }
        const data = await res.json();
        if (cancelled) return;
        setWaiting(false);
        setToken(data.token);
        setWsUrl(data.wsUrl);
        if (data.joinToken) setJoinToken(data.joinToken);
        if (data.meetingId) setMeetingIdReal(data.meetingId);
        if (data.canKick) setCanKick(true);
      } catch (e: any) {
        console.error('Join token error:', e);
        if (!cancelled) setError(e.message);
      }
    }
    fetchToken();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id, guestName]);

  if (error) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#111317', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Помилка</div>
          <div style={{ color: '#999', marginBottom: 16, maxWidth: 360 }}>{error}</div>
          <button onClick={() => router.push('/')} style={{
            padding: '10px 20px', borderRadius: 10, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
          }}>На головну</button>
        </div>
      </div>
    );
  }

  if (waiting && !token) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#111317', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 380 }}>
          <div style={{
            width: 40, height: 40, border: '3px solid rgba(255,255,255,.15)',
            borderTop: '3px solid #3b82f6', borderRadius: '50%',
            animation: 'spin .8s linear infinite', margin: '0 auto 18px',
          }} />
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Очікування підтвердження</div>
          <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, lineHeight: 1.5 }}>Організатор має впустити вас у мітинг. Зачекайте, будь ласка...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!token || !wsUrl) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#111317', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, border: '3px solid rgba(255,255,255,.15)',
            borderTop: '3px solid #3b82f6', borderRadius: '50%',
            animation: 'spin .8s linear infinite',
          }} />
          <span style={{ fontSize: 15, color: 'rgba(255,255,255,.6)' }}>Підключення до кімнати...</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#111317' }}>
      <LiveKitRoom
        serverUrl={wsUrl}
        token={token}
        connect={true}
        video={startWithVideo}
        audio={startWithAudio}
        options={{
          audioCaptureDefaults: micDeviceId ? { deviceId: micDeviceId } : undefined,
          videoCaptureDefaults: camDeviceId ? { deviceId: camDeviceId } : undefined,
          audioOutput: spkDeviceId ? { deviceId: spkDeviceId } : undefined,
        }}
        onDisconnected={() => {
          if (guestName) router.push('/');
          else if (id === 'quick') router.push('/');
          else router.push(`/meetings/${id}/report`);
        }}
        style={{ height: '100%' }}
      >
        <RoomContent meetingId={meetingIdReal || id as string} joinToken={joinToken} isGuest={!!guestName} canKick={canKick} openTranscript={startWithTranscript} />
      </LiveKitRoom>
    </div>
  );
}
