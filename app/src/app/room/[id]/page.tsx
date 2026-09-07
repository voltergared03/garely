'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Select } from '@/components/ui/select';
import { useSaveErrorToast } from '@/components/save-toast';
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
import { Track, RoomEvent, ScreenSharePresets } from 'livekit-client';
import { Logo } from '@/components/ui/logo';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  Phone, MessageSquare, FileText, X, Languages,
  Send, MoreVertical, Users, UserPlus, Link2, Check,
  LogOut, Shield, Crown, Volume2, ChevronDown,
  Smile, StickyNote, Sparkles, Zap, Save, Sidebar, ListChecks, AlertCircle} from 'lucide-react';
import {
  TranscriptEntry, FloatingReaction, LiveAiNote, DetectedActionItem, MeetingBriefing, REACTIONS,
} from './lib/types';
import { AdmissionPanel } from './components/AdmissionPanel';
import { ParticipantTile } from './components/ParticipantTile';
import { RoomDeviceSelect } from './components/RoomDeviceSelect';
import { ControlBtn, MoreItem } from './components/ControlBtn';
import { useIsMobile } from '@/lib/use-is-mobile';
import css from './page.module.css';

/* ══════════════════════════════════════════════════════════
   ROOM CONTENT — rendered inside <LiveKitRoom>
   ══════════════════════════════════════════════════════════ */
function RoomContent({ meetingId, joinToken, isGuest, canKick, openTranscript, recordingActive, meetingInfo }: {
  meetingId: string; joinToken?: string; isGuest?: boolean; canKick?: boolean; openTranscript?: boolean; recordingActive?: boolean; meetingInfo?: MeetingBriefing;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const router = useRouter();

  /* ── sidebar state ─────────────────── */
  const [sidePanel, setSidePanel] = useState<'agenda' | 'chat' | 'transcript' | 'participants' | 'notes' | 'ai-notes' | null>(openTranscript ? 'transcript' : null);
  const [showMore, setShowMore] = useState(false);
  /* ── meeting briefing (description + agenda "питання") ── */
  const agendaItems = useMemo(
    () => (meetingInfo?.agenda ?? []).filter((s): s is string => typeof s === 'string' && s.trim().length > 0),
    [meetingInfo],
  );
  const briefingDescription = meetingInfo?.description?.trim() || '';
  const hasBriefing = briefingDescription.length > 0 || agendaItems.length > 0;
  const isMobile = useIsMobile();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedCam, setSelectedCam] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);
  // A failed kick used to raise a modal dialog over a live call — it steals focus from
  // the video, and everyone else in the room keeps talking while you dismiss it.
  const { showSaveError, saveToast } = useSaveErrorToast();

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
    if (!confirm(tr('room.kickConfirm'))) return;
    setKickingId(identity);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIdentity: identity }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showSaveError(data.error || tr('room.kickFailed'));
      }
    } catch {
      showSaveError(tr('room.connectionError'));
    } finally {
      setKickingId(null);
    }
  }, [meetingId]);

  /* ── device management ────────────── */
  const enumerateDevices = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setDevices(devs);

      // Resolve the device actually in use for each kind; fall back to the
      // browser "default" entry (or the first available) so each select shows
      // a real device name instead of the "not found" placeholder.
      const resolve = (kind: MediaDeviceKind, fromTrack?: string) => {
        if (fromTrack && devs.some(d => d.kind === kind && d.deviceId === fromTrack)) return fromTrack;
        const list = devs.filter(d => d.kind === kind && d.deviceId);
        return (list.find(d => d.deviceId === 'default') || list[0])?.deviceId || '';
      };

      const micId = localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack?.getSettings()?.deviceId;
      const camId = localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack?.getSettings()?.deviceId;

      setSelectedMic(prev => prev || resolve('audioinput', micId));
      setSelectedCam(prev => prev || resolve('videoinput', camId));
      setSelectedSpeaker(prev => prev || resolve('audiooutput'));
    } catch (e) { console.error('Device enum error:', e); }
  }, [localParticipant]);

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

  // Group consecutive same-speaker / same-language finals into one block so a
  // continuous turn reads as a paragraph (mirrors the server-side merge).
  const groupedTranscripts = useMemo(() => {
    const out: { id: string; speaker: string; language: string; text: string }[] = [];
    for (const e of transcripts) {
      const last = out[out.length - 1];
      if (last && last.speaker === e.speaker && last.language === e.language) {
        last.text += ' ' + e.text;
      } else {
        out.push({ id: e.id, speaker: e.speaker, language: e.language, text: e.text });
      }
    }
    return out;
  }, [transcripts]);

  /* ── recording (fully automatic — starts with the meeting; no manual toggle) ── */
  const [recording, setRecording] = useState(!!recordingActive);

  // Keep the REC indicator truthful if recording state is broadcast on the data channel.
  const onRecordingState = useCallback((raw: { payload: Uint8Array }) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(raw.payload));
      if (msg.type !== 'recording') return;
      setRecording(!!msg.active);
    } catch { /* skip */ }
  }, []);

  useDataChannel('recording', onRecordingState);

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
  // The save used to claim success unconditionally: the fetch result was never read and
  // a network error was swallowed by an empty catch, so a rejected save still printed
  // "Saved at 14:32". People take notes during a call believing they are shared and
  // kept; telling them that when it is not true is worse than saying nothing.
  const [notesFailed, setNotesFailed] = useState(false);
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
      // One retry before admitting failure: this runs during a live call, where a
      // one-second network blip is ordinary and losing the note is not.
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 1200));
        try {
          const res = await fetch(`/api/meetings/${meetingId}/notes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: value }),
          });
          ok = res.ok;
        } catch {
          ok = false; // offline / aborted — worth one more try
        }
      }
      if (ok) {
        setNotesFailed(false);
        setNotesLastSaved(new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }));
      } else {
        // Deliberately leave notesLastSaved alone: the last time it really saved is
        // still true and still useful — it says how much is at risk.
        setNotesFailed(true);
      }
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
  // Screen share is tuned for TEXT (spreadsheets, dashboards, code), not motion.
  // Publish options are per-track, so none of this touches the camera.
  const toggleScreen = async () => {
    try {
      if (screenOn) {
        await localParticipant.setScreenShareEnabled(false);
        setScreenOn(false);
        return;
      }
      await localParticipant.setScreenShareEnabled(
        true,
        // Deliberately no `resolution` here: passing one defeats the SDK's Safari-17
        // guard (WebKit 263015 captures at a fraction of the real size) and pins
        // capture to 15fps.
        { contentHint: 'text' },
        {
          // Pinned, not cosmetic. For an SVC codec (vp9/av1) the SDK overwrites
          // contentHint with 'motion' at publish time, silently undoing the line
          // above — so a "better codec" here would make text worse, not better.
          videoCodec: 'vp8',
          // A ceiling, not a target: congestion control still backs off on weak
          // uplinks, so this only spends bits on transients (scroll, window switch)
          // — exactly when text smears. 15fps is deliberate: h1080fps30 costs 2x
          // uplink and CPU for the same bits-per-pixel.
          screenShareEncoding: { maxBitrate: 4_000_000, maxFramerate: 15, priority: 'medium' },
          // Layers are additive, not a split, so this buys the 1080p layer nothing —
          // it just trims the spare 540p/625kbps layer we never switch down to
          // (adaptiveStream and dynacast are both off).
          screenShareSimulcastLayers: [ScreenSharePresets.h360fps3],
        },
      );
      setScreenOn(true);
    } catch { /* user cancelled */ }
  };
  const [leaveChoice, setLeaveChoice] = useState(false);

  const exitRoom = () => {
    room.disconnect();
    if (isGuest) router.push('/');
    else if (meetingId === 'quick') router.push('/');
    else router.push(`/meetings/${meetingId}/report`);
  };

  // Leaving a room you are ALONE in is ambiguous — usually "back in a minute", not
  // "we're done". Ask, instead of guessing. Everyone else (guests, quick meetings, or
  // anyone leaving a room that still has people in it) keeps the old one-click exit.
  //
  // This is a convenience, not the safety net: closing the tab skips it entirely, which
  // is why the real protection is the server-side abandoned-attempt check.
  const leaveMeeting = () => {
    const alone = participants.filter((p) => !p.identity.startsWith('agent-')).length <= 1;
    if (alone && !isGuest && meetingId !== 'quick') { setLeaveChoice(true); return; }
    exitRoom();
  };

  const endMeetingForEveryone = async () => {
    // Records a human verdict that the meeting happened, so the report is produced even
    // though the session was short and quiet.
    await fetch(`/api/meetings/${meetingId}/end`, { method: 'POST' }).catch(() => {});
    exitRoom();
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

  /* ── grid shape ─────────────────────
   * Columns and rows are chosen together so the grid never leaves a dead cell: with
   * three people the old 2-column grid put one tile alone on a second row beside an
   * empty quadrant, and the tiles kept a fixed 16:9 box instead of taking the space.
   * Every tile now fills its cell (video is object-fit: cover), rows are equal, and an
   * odd last tile is centred by spanning the remaining columns. */
  const tileCount = visibleCameraTracks.length;
  const gridCols = tileCount <= 1 ? 1 : tileCount <= 2 ? 2 : tileCount <= 6 ? 3 : 4;
  const gridRows = Math.max(1, Math.ceil(tileCount / gridCols));
  // Cells left empty in the last row, e.g. 3 tiles in 3 cols → 0; 4 in 3 → 2; 5 in 3 → 1.
  const lastRowGap = gridCols * gridRows - tileCount;

  /* ── language flags ────────────────── */
  const langFlag: Record<string, string> = { uk: '🇺🇦', en: '🇬🇧', ru: '🇷🇺' };

  return (
    <div className={css.shell} style={{ background: '#111317' }}>
      <RoomAudioRenderer />
      {!isGuest && <AdmissionPanel meetingId={meetingId} />}

      {/* ── Floating Reactions ──────────── */}
      {floatingReactions.map(r => (
        <div key={r.id} className={css.reaction} style={{ left: `${r.x}%` }}>
          <div className={css.center}>
            <span className={css.reactionEmoji}>{r.emoji}</span>
            <div className={css.reactionSender} style={{ color: 'rgba(255,255,255,.7)' }}>{r.sender}</div>
          </div>
        </div>
      ))}

      {/* ── Action Item Toasts ──────────── */}
      <div className={css.toastStack}>
        {detectedActions.map(action => (
          <div key={action.id} className={css.toast} style={{
            background: 'rgba(30, 32, 40, 0.95)',
            border: '1px solid rgba(167,139,250,.3)',
            boxShadow: '0 8px 30px rgba(0,0,0,.4)',
          }}>
            <div className={css.toastIcon} style={{ background: 'rgba(167,139,250,.15)' }}>
              <Zap size={16} className={css.iconPurple} />
            </div>
            <div className={css.flex1min}>
              <div className={css.toastLabel}>
                Action Item
              </div>
              <div className={css.toastTitle}>
                {action.title}
              </div>
              {action.assignee && (
                <div className={css.toastAssignee} style={{ color: 'rgba(255,255,255,.5)' }}>
                  → {action.assignee}
                </div>
              )}
            </div>
            <button onClick={() => dismissAction(action.id)} className={css.toastClose} style={{ color: 'rgba(255,255,255,.3)' }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Share popup - fixed overlay */}
      {showSharePopup && (
        <div onClick={() => setShowSharePopup(false)} className={css.modalOverlay} style={{ background: 'rgba(0,0,0,.4)' }}>
          <div onClick={(e) => e.stopPropagation()} className={css.shareCard} style={{
            background: '#1e2028', border: '1px solid rgba(255,255,255,.1)',
          }}>
            <div className={css.shareHead}>
              <div className={css.shareTitle}>{tr('room.inviteParticipants')}</div>
              <button onClick={() => setShowSharePopup(false)} className={css.shareClose} style={{ color: 'rgba(255,255,255,.5)' }}><X size={14} /></button>
            </div>
            <div className={css.shareHint} style={{ color: 'rgba(255,255,255,.5)' }}>
              {tr('room.inviteHint')}
            </div>
            <div className={css.linkRow}>
              <Link2 size={15} className={css.iconShrink} style={{ color: 'rgba(255,255,255,.4)' }} />
              <div className={css.linkText} style={{ color: 'rgba(255,255,255,.7)' }}>{shareLink}</div>
            </div>
            <button onClick={() => { copyShareLink(); }} className={css.copyBtn} style={{ background: linkCopied ? '#22c55e' : 'var(--accent)' }}>
              {linkCopied ? <><Check size={15} /> {tr('room.linkCopied')}</> : <><Link2 size={15} /> {tr('room.copyLink')}</>}
            </button>
          </div>
        </div>
      )}

      {/* ── TOP BAR ──────────────────────── */}
      <div className={`room-top-bar ${css.topBar}`} style={{ background: '#1a1d23' }}>
        <Logo />
        {recording && (
          <span className={css.recPill} style={{
            background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)',
          }}>
            <span className={css.recDot} />
            REC
          </span>
        )}
        <span className={`room-timer ${css.timer}`} style={{ color: 'rgba(255,255,255,.45)' }}>
          {fmtTime(elapsed)}
        </span>
        <div className={css.spacer} />
        <div className={css.peopleCount} style={{ color: 'rgba(255,255,255,.5)' }}>
          <Users size={14} /> {humanCount}
        </div>
      </div>

      {/* ── MAIN AREA (video + sidebar) ── */}
      <div className={css.mainArea}>

        {/* ── Video area ─────────────────── */}
        <div className={css.videoCol}>

          <div className={css.stage}>
            {hasScreenShare ? (
              <div className={css.screenWrap}>
                <div className={css.screenMain} style={{ background: '#000' }}>
                  {mainScreen?.publication?.track && (
                    <VideoTrack trackRef={mainScreen}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  )}
                  <div className={css.screenLabel}>
                    📺 {mainScreen?.participant?.name || tr('room.screenShare')}
                  </div>
                </div>
                <div className={`room-filmstrip ${css.filmstrip}`}>
                  {visibleCameraTracks.map(track => (
                    <ParticipantTile key={track.participant.sid} track={track} small />
                  ))}
                </div>
              </div>
            ) : (
              <div className={`room-video-grid ${css.videoGrid}`} style={{
                // Doubled columns let an odd last tile span two units and land centred.
                gridTemplateColumns: `repeat(${gridCols * 2}, 1fr)`,
                gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
              }}>
                {visibleCameraTracks.map((track, i) => {
                  const inLastRow = i >= (gridRows - 1) * gridCols;
                  // Shift the whole last row right by the gap so it is centred rather
                  // than left-aligned against an empty quadrant.
                  const offset = inLastRow && lastRowGap > 0 && i === (gridRows - 1) * gridCols ? lastRowGap : 0;
                  return (
                    <div key={track.participant.sid} className={css.gridCell} style={{
                      gridColumn: `${offset ? `${offset + 1} / ` : ''}span 2`,
                    }}>
                      <ParticipantTile track={track} fill />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── CONTROL BAR ──────────────── */}
          <div className={`room-controls ${css.controls}`} style={{ background: '#1a1d23' }}>
            <ControlBtn active={micOn} onClick={toggleMic} danger={!micOn}
              icon={micOn ? <Mic size={20} /> : <MicOff size={20} />} label={micOn ? tr('room.microphone') : tr('room.turnOn')} />
            <ControlBtn active={camOn} onClick={toggleCam} danger={!camOn}
              icon={camOn ? <Video size={20} /> : <VideoOff size={20} />} label={camOn ? tr('room.camera') : tr('room.turnOn')} />

            {/* Screen: inline on desktop; folded into the ⋮ More menu on mobile */}
            {!isMobile && (
              <ControlBtn active={screenOn} onClick={toggleScreen}
                icon={screenOn ? <MonitorOff size={20} /> : <Monitor size={20} />} label={tr('room.screen')} />
            )}

            {/* Reactions */}
            <div className={css.rel}>
              <ControlBtn active={showReactionPicker} onClick={() => setShowReactionPicker(!showReactionPicker)}
                icon={<Smile size={20} />} label={tr('room.reactions')} />
              {showReactionPicker && (
                <>
                  <div onClick={() => setShowReactionPicker(false)} className={css.backdrop} />
                  <div className={css.reactionPicker} style={{ background: '#1e2028' }}>
                    {REACTIONS.map(emoji => (
                      <button key={emoji} onClick={() => sendReaction(emoji)} className={css.reactionBtn}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-2)'; e.currentTarget.style.transform = 'scale(1.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.transform = 'scale(1)'; }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ⋮ More — secondary actions (record / invite / devices; +screen, CC on mobile) */}
            <div className={css.rel}>
              <ControlBtn active={showMore} onClick={() => { if (!showMore) enumerateDevices(); setShowMore(!showMore); }}
                icon={<MoreVertical size={20} />} label={tr('room.more')} />
              {showMore && (
                <>
                  <div onClick={() => setShowMore(false)} className={css.backdrop} />
                  <div className={css.moreMenu} style={{ background: '#1e2028' }}>
                    {isMobile && (
                      <MoreItem icon={screenOn ? <MonitorOff size={17} /> : <Monitor size={17} />} active={screenOn}
                        label={tr('room.screen')} onClick={() => { toggleScreen(); setShowMore(false); }} />
                    )}
                    {/* Recording is fully automatic (starts with the meeting) — no manual
                        toggle. The REC indicator stays for transparency. */}
                    {!isGuest && (
                      <MoreItem icon={<UserPlus size={17} />}
                        label={tr('room.invite')} onClick={() => { setShowSharePopup(true); setShowMore(false); }} />
                    )}
                    <div className={css.menuDivider} />
                    <div className={css.menuLabel} style={{ color: 'rgba(255,255,255,.4)' }}>{tr('room.devices')}</div>
                    <RoomDeviceSelect label={tr('room.microphone')} icon={<Mic size={13} />}
                      devices={devices.filter(d => d.kind === 'audioinput')}
                      value={selectedMic} onChange={switchMic} />
                    <RoomDeviceSelect label={tr('room.camera')} icon={<Video size={13} />}
                      devices={devices.filter(d => d.kind === 'videoinput')}
                      value={selectedCam} onChange={switchCam} />
                    <RoomDeviceSelect label={tr('room.speakers')} icon={<Volume2 size={13} />}
                      devices={devices.filter(d => d.kind === 'audiooutput')}
                      value={selectedSpeaker} onChange={switchSpeaker} />
                  </div>
                </>
              )}
            </div>

            <div className={`room-controls-divider ${css.ctrlDivider}`} style={{ background: 'rgba(255,255,255,.1)' }} />

            {/* Panel — participants / chat / transcript / notes / AI in one tabbed surface */}
            <ControlBtn active={!!sidePanel}
              onClick={() => setSidePanel(sidePanel ? null : 'participants')}
              icon={<Sidebar size={20} />} label={tr('room.panel')}
              badge={humanCount > 1 ? humanCount : undefined} />

            <div className={`room-controls-divider ${css.ctrlDivider}`} style={{ background: 'rgba(255,255,255,.1)' }} />

            <button className={`room-leave-btn ${css.leaveBtn}`} onClick={leaveMeeting} title={tr('room.leave')}>
              <Phone size={18} className={css.phoneIcon} />
              <span className="room-leave-label">{tr('room.leave')}</span>
            </button>
          </div>
        </div>

        {/* ── SIDE PANEL ─────────────────── */}
        {sidePanel && (
          <div className={`room-side-panel ${css.sidePanel}`} style={{ background: '#1a1d23' }}>
            <div className={css.tabsBar}>
              <div className={css.tabsScroll}>
                {([
                  ...(hasBriefing ? [{ id: 'agenda' as const, label: tr('room.agenda'), icon: <ListChecks size={16} />, badge: agendaItems.length }] : []),
                  { id: 'participants', label: tr('room.participants'), icon: <Users size={16} />, badge: humanCount > 1 ? humanCount : 0 },
                  { id: 'chat', label: tr('room.chat'), icon: <MessageSquare size={16} />, badge: chatMessages.length },
                  { id: 'transcript', label: tr('room.text'), icon: <FileText size={16} />, badge: 0 },
                  { id: 'notes', label: tr('room.notes'), icon: <StickyNote size={16} />, badge: 0 },
                  { id: 'ai-notes', label: tr('room.ai'), icon: <Sparkles size={16} />, badge: 0 },
                ] as const).map((tab) => {
                  const on = sidePanel === tab.id;
                  return (
                    <button key={tab.id} onClick={() => setSidePanel(tab.id)} title={tab.label} className={css.tabBtn} style={{
                      borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent',
                      color: on ? '#fff' : 'rgba(255,255,255,.5)',
                    }}>
                      {tab.icon}
                      <span className={css.tabLabel}>{tab.label}</span>
                      {tab.badge > 0 && (
                        <span className={css.tabBadge}>{tab.badge > 9 ? '9+' : tab.badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setSidePanel(null)} aria-label="Close" className={css.panelClose} style={{ color: 'rgba(255,255,255,.4)' }}><X size={16} /></button>
            </div>

            {/* ── Agenda panel (meeting briefing: description + питання) ── */}
            {sidePanel === 'agenda' && (
              <div className={css.agendaPane}>
                {meetingInfo?.title && (
                  <div className={css.agendaTitle}>
                    {meetingInfo.title}
                  </div>
                )}
                {briefingDescription && (
                  <div>
                    <div className={css.sectionLabel} style={{ color: 'rgba(255,255,255,.4)' }}>
                      {tr('meetingForm.description')}
                    </div>
                    <div className={css.briefingText} style={{ color: 'rgba(255,255,255,.8)' }}>
                      {briefingDescription}
                    </div>
                  </div>
                )}
                {agendaItems.length > 0 && (
                  <div>
                    <div className={css.sectionLabelRow} style={{ color: 'rgba(255,255,255,.4)' }}>
                      <ListChecks size={13} /> {tr('schedule.agendaHeading')}
                    </div>
                    <div className={css.colGap8}>
                      {agendaItems.map((item, idx) => (
                        <div key={idx} className={css.agendaRow}>
                          <span className={css.agendaNum} style={{
                            background: 'rgba(59,130,246,.15)', color: '#93c5fd',
                          }}>{idx + 1}</span>
                          <span className={css.agendaItem} style={{ color: 'rgba(255,255,255,.85)' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Participants panel ── */}
            {sidePanel === 'participants' && (
              <div className={css.participantsPane}>
                {humanParticipants.map(p => {
                  const isLocal = p.isLocal;
                  const identity = p.identity || '';
                  const isGuestUser = identity.startsWith('guest-');
                  const isMicEnabled = p.isMicrophoneEnabled;
                  const isCamEnabled = p.isCameraEnabled;

                  return (
                    <div key={p.sid} className={css.pRow}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Avatar */}
                      <div className={css.pAvatar} style={{ background: isGuestUser ? '#6366f1' : 'var(--accent)' }}>
                        {(p.name || identity || 'U')[0]?.toUpperCase()}
                      </div>

                      {/* Name + badge */}
                      <div className={css.flex1min}>
                        <div className={css.pName}>
                          <span className={css.ellipsis}>
                            {p.name || identity}
                          </span>
                          {isLocal && (
                            <span className={css.miniBadge} style={{ background: 'rgba(59,130,246,.2)', color: '#93c5fd' }}>{tr('room.you')}</span>
                          )}
                          {isGuestUser && (
                            <span className={css.miniBadge} style={{ background: 'rgba(99,102,241,.2)', color: '#a5b4fc' }}>{tr('room.guest')}</span>
                          )}
                        </div>
                        {/* Media status */}
                        <div className={css.pMedia}>
                          {isMicEnabled ? (
                            <Mic size={11} style={{ color: 'rgba(255,255,255,.35)' }} />
                          ) : (
                            <MicOff size={11} className={css.iconDanger} />
                          )}
                          {isCamEnabled ? (
                            <Video size={11} style={{ color: 'rgba(255,255,255,.35)' }} />
                          ) : (
                            <VideoOff size={11} className={css.iconDanger} />
                          )}
                        </div>
                      </div>

                      {/* Kick button — only for admin/host, not for self */}
                      {canKick && !isLocal && (
                        <button
                          onClick={() => kickParticipant(identity)}
                          disabled={kickingId === identity}
                          title={tr('room.removeFromMeeting')}
                          className={css.kickBtn}
                          style={{
                            border: '1px solid rgba(239,68,68,.2)',
                            background: kickingId === identity ? 'rgba(239,68,68,.2)' : 'transparent',
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
                  <div className={css.emptyState} style={{ color: 'rgba(255,255,255,.25)' }}>
                    <Users size={28} className={css.emptyIcon} />
                    <div>{tr('room.noParticipants')}</div>
                  </div>
                )}

                {canKick && humanCount > 1 && (
                  <div className={css.adminHint} style={{
                    background: 'rgba(255,255,255,.03)', color: 'rgba(255,255,255,.35)',
                  }}>
                    <Shield size={13} className={css.iconShrink} />
                    <span>{tr('room.canRemoveParticipants')}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Chat panel ── */}
            {sidePanel === 'chat' && (
              <>
                <div ref={chatScrollRef} className={css.chatScroll}>
                  {chatMessages.length === 0 && (
                    <div className={css.emptyState} style={{ color: 'rgba(255,255,255,.25)' }}>
                      <MessageSquare size={28} className={css.emptyIcon} />
                      <div>{tr('room.noMessages')}</div>
                    </div>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i}>
                      <div className={css.chatMeta}>
                        <span className={css.chatFrom}>
                          {m.from?.name || m.from?.identity || tr('room.you')}
                        </span>
                        <span className={css.chatTime} style={{ color: 'rgba(255,255,255,.25)' }}>
                          {new Date(m.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className={css.chatText} style={{ color: 'rgba(255,255,255,.8)' }}>{m.message}</div>
                    </div>
                  ))}
                </div>
                <div className={css.composer}>
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                    placeholder={tr('room.messagePlaceholder')}
                    className={css.chatInput}
                    style={{ border: '1px solid rgba(255,255,255,.1)' }} />
                  <button onClick={handleSendChat} disabled={isSending || !chatInput.trim()} className={css.sendBtn} style={{
                    background: chatInput.trim() ? 'var(--accent)' : 'var(--hover)',
                    opacity: chatInput.trim() ? 1 : 0.4,
                  }}><Send size={16} /></button>
                </div>
              </>
            )}

            {/* ── Transcript panel ── */}
            {sidePanel === 'transcript' && (
              <div ref={transcriptScrollRef} className={css.txScroll}>
                {transcripts.length === 0 && Object.keys(interimRef.current).length === 0 && (
                  <div className={css.emptyStateTall} style={{ color: 'rgba(255,255,255,.25)' }}>
                    <Languages size={28} className={css.emptyIcon} />
                    <div>{tr('room.transcriptEmptyLine1')}</div>
                    <div>{tr('room.transcriptEmptyLine2')}</div>
                  </div>
                )}
                {groupedTranscripts.map(e => (
                  <div key={e.id}>
                    <div className={css.txMeta}>
                      <span className={css.txSpeaker}>{e.speaker}</span>
                      <span className={css.txFlag}>{langFlag[e.language] || '🌐'}</span>
                    </div>
                    <div className={css.txText} style={{ color: 'rgba(255,255,255,.7)' }}>{e.text}</div>
                  </div>
                ))}
                {Object.entries(interimRef.current).map(([speaker, text]) => (
                  <div key={`int-${speaker}`} className={css.txInterim}>
                    <div className={css.txSpeakerInterim}>{speaker} <span className={css.txDots} style={{ color: '#93c5fd' }}>...</span></div>
                    <div className={css.txInterimText} style={{ color: 'rgba(255,255,255,.5)' }}>{text}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Notes panel ── */}
            {sidePanel === 'notes' && (
              <div className={css.notesPane}>
                <div className={css.notesHead} style={{ color: 'rgba(255,255,255,.35)' }}>
                  {notesSaving ? (
                    <><Save size={11} className={css.spin} /> {tr('common.saving')}</>
                  ) : notesFailed ? (
                    <span role="alert" className={css.notesFailed}>
                      <AlertCircle size={11} />
                      {notesLastSaved
                        ? tr('room.notesSaveFailedSince', { time: notesLastSaved })
                        : tr('room.notesSaveFailed')}
                    </span>
                  ) : notesLastSaved ? (
                    <><Check size={11} /> {tr('room.savedAt', { time: notesLastSaved })}</>
                  ) : (
                    <><StickyNote size={11} /> {tr('room.sharedNotesHint')}</>
                  )}
                </div>
                <textarea
                  value={notesContent}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder={tr('room.notesPlaceholder')}
                  className={css.notesArea}
                  style={{ background: 'transparent', color: 'rgba(255,255,255,.85)' }}
                />
              </div>
            )}

            {/* ── AI Notes panel ── */}
            {sidePanel === 'ai-notes' && (
              <div className={css.aiPane}>
                {!liveAiNotes ? (
                  <div className={css.emptyStateTall} style={{ color: 'rgba(255,255,255,.25)' }}>
                    <Sparkles size={28} className={css.emptyIcon} />
                    <div>{tr('room.aiEmptyLine1')}</div>
                    <div>{tr('room.aiEmptyLine2')}</div>
                    <div className={css.aiHintSmall} style={{ color: 'rgba(255,255,255,.15)' }}>
                      {tr('room.aiUpdatesAuto')}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    {liveAiNotes.summary && (
                      <div>
                        <div className={`${css.aiLabel} ${css.aiLabelSummary}`}>
                          <Sparkles size={11} /> {tr('room.summary')}
                        </div>
                        <div className={css.aiSummary} style={{
                          color: 'rgba(255,255,255,.75)',
                          background: 'rgba(59,130,246,.06)',
                          border: '1px solid rgba(59,130,246,.1)',
                        }}>
                          {liveAiNotes.summary}
                        </div>
                      </div>
                    )}

                    {/* Decisions */}
                    {liveAiNotes.decisions.length > 0 && (
                      <div>
                        <div className={`${css.aiLabel} ${css.aiLabelDecisions}`}>
                          <Check size={11} /> {tr('room.decisions')}
                        </div>
                        {liveAiNotes.decisions.map((d, i) => (
                          <div key={i} className={css.aiItem} style={{
                            color: 'rgba(255,255,255,.7)',
                            borderLeft: '2px solid rgba(16,185,129,.4)',
                          }}>
                            {d}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Items */}
                    {liveAiNotes.actionItems.length > 0 && (
                      <div>
                        <div className={`${css.aiLabel} ${css.aiLabelActions}`}>
                          <Zap size={11} /> Action Items
                        </div>
                        {liveAiNotes.actionItems.map((a, i) => (
                          <div key={i} className={css.aiItem} style={{
                            color: 'rgba(255,255,255,.7)',
                            borderLeft: '2px solid rgba(167,139,250,.4)',
                          }}>
                            {a}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Updated timestamp */}
                    <div className={css.aiUpdated} style={{ color: 'rgba(255,255,255,.2)' }}>
                      {tr('room.updatedAt', { time: new Date(liveAiNotes.updatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}
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

      {/* Leaving a room you are alone in: "stepping out" and "we're done" look identical
          to the server, so ask rather than guess. Declining just leaves — the meeting
          stays open for whoever arrives next. */}
      {leaveChoice && (
        <div
          onClick={() => setLeaveChoice(false)}
          className={css.leaveOverlay} style={{ background: 'rgba(6,8,12,.62)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className={css.leaveCard}
            style={{ background: 'var(--card, #16181d)', color: '#e8e8ea', boxShadow: '0 24px 70px -20px rgba(0,0,0,.75)' }}
          >
            <div className={css.leaveTitle}>{tr('room.leaveTitle')}</div>
            <div className={css.leaveBody} style={{ color: '#a9a9b4' }}>{tr('room.leaveBody')}</div>
            <div className={css.colGap8}>
              <button className={`btn btn-primary ${css.dialogBtnBold}`} onClick={exitRoom}>
                {tr('room.leaveOnly')}
              </button>
              <button className={`btn ${css.dialogBtn}`} onClick={() => void endMeetingForEveryone()}>
                {tr('room.endForAll')}
              </button>
              <button className={`btn btn-ghost ${css.dialogBtnGhost}`} onClick={() => setLeaveChoice(false)}>
                {tr('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      {saveToast}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════ */
export default function MeetingRoomPage() {
  const t = useTranslations();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const startWithVideo = searchParams.get('cam') !== '0';
  const startWithAudio = searchParams.get('mic') !== '0';
  const startWithTranscript = searchParams.get('tx') === '1';
  const guestName = searchParams.get('guest') || '';
  const micDeviceId = searchParams.get('micId') || '';
  const camDeviceId = searchParams.get('camId') || '';
  const spkDeviceId = searchParams.get('spkId') || '';
  const startNow = searchParams.get('start') === '1'; // host explicitly starting before the 5-min window
  const router = useRouter();
  const [token, setToken] = useState('');
  const [wsUrl, setWsUrl] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [meetingIdReal, setMeetingIdReal] = useState('');
  const [canKick, setCanKick] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [meetingInfo, setMeetingInfo] = useState<MeetingBriefing>({ title: null, description: null, agenda: null });
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
        if (startNow) body.startNow = true; // host starting before the 5-min entry window

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
          // 410 = this occurrence ended/cancelled. If the series has a live
          // successor, bounce straight there so the user lands with everyone
          // else instead of hitting a dead room.
          if (res.status === 410 && errData.nextToken) {
            if (!cancelled) router.replace(`/join/${errData.nextToken}`);
            return;
          }
          throw new Error(errData.denied ? t('room.accessDenied') : (errData.error || t('room.tokenFailed')));
        }
        const data = await res.json();
        if (cancelled) return;
        setWaiting(false);
        setToken(data.token);
        setWsUrl(data.wsUrl);
        if (data.joinToken) setJoinToken(data.joinToken);
        if (data.meetingId) {
          setMeetingIdReal(data.meetingId);
          // Quick meetings live at /room/quick; once the real meeting exists,
          // rewrite the address bar to its id so a copied URL is shareable.
          // history.replaceState (not router) keeps it cosmetic — no refetch.
          if (id === 'quick' && typeof window !== 'undefined') {
            window.history.replaceState(null, '', `/room/${data.meetingId}${window.location.search}`);
          }
        }
        if (data.canKick) setCanKick(true);
        if (typeof data.recordingActive === 'boolean') setRecordingActive(data.recordingActive);
        setMeetingInfo({
          title: typeof data.title === 'string' ? data.title : null,
          description: typeof data.description === 'string' ? data.description : null,
          agenda: Array.isArray(data.agenda) ? data.agenda.filter((x: unknown) => typeof x === 'string' && x.trim()) : null,
        });
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
      <div className={css.fullscreen} style={{ background: '#111317' }}>
        <div className={css.errBox}>
          <div className={css.errTitle}>{t('room.error')}</div>
          <div className={css.errMsg} style={{ color: '#999' }}>{error}</div>
          <button onClick={() => router.push('/')} className={css.homeBtn}>{t('room.goHome')}</button>
        </div>
      </div>
    );
  }

  if (waiting && !token) {
    return (
      <div className={css.fullscreen} style={{ background: '#111317' }}>
        <div className={css.waitBox}>
          <div className={css.spinnerLg} style={{
            border: '3px solid rgba(255,255,255,.15)',
            borderTop: '3px solid var(--accent)',
          }} />
          <div className={css.waitTitle}>{t('room.waitingTitle')}</div>
          <div className={css.waitDesc} style={{ color: 'rgba(255,255,255,.6)' }}>{t('room.waitingDesc')}</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!token || !wsUrl) {
    return (
      <div className={css.fullscreen} style={{ background: '#111317' }}>
        <div className={css.connRow}>
          <div className={css.spinnerSm} style={{
            border: '3px solid rgba(255,255,255,.15)',
            borderTop: '3px solid var(--accent)',
          }} />
          <span className={css.connText} style={{ color: 'rgba(255,255,255,.6)' }}>{t('room.connecting')}</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className={css.pageRoot} style={{ background: '#111317' }}>
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
        <RoomContent meetingId={meetingIdReal || id as string} joinToken={joinToken} isGuest={!!guestName} canKick={canKick} openTranscript={startWithTranscript} recordingActive={recordingActive} meetingInfo={meetingInfo} />
      </LiveKitRoom>
    </div>
  );
}
