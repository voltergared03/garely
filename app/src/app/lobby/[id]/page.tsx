'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Select } from '@/components/ui/select';
import { useSession } from 'next-auth/react';
import { Logo } from '@/components/ui/logo';
import { AvatarStack } from '@/components/ui/avatar';
import {
  Mic, MicOff, Video, VideoOff, Settings,
  X, Users, Clock, Lock, ChevronDown, Volume2, Speaker, ListChecks,
} from 'lucide-react';
import { fmtRelative, fmtTime } from '@/lib/utils';
import s from './page.module.css';

export default function LobbyPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const guestName = searchParams.get('guest') || '';
  const { data: session } = useSession();
  const [meeting, setMeeting] = useState<any>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [txPref, setTxPref] = useState(false); // open transcript panel on join (user pref)
  const [name, setName] = useState('');
  const [showDevices, setShowDevices] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedCam, setSelectedCam] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');

  const appliedPrefs = useRef(false);

  useEffect(() => {
    if (guestName) setName(guestName);
    else if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.name]);

  // Apply the user's "join with mic/cam on" preferences (registered users only;
  // guests keep mic/cam on by default). Runs once when the session is available.
  useEffect(() => {
    if (appliedPrefs.current || !session?.user) return;
    appliedPrefs.current = true;
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.preferences) {
          setMic(!!d.preferences.micOnJoin);
          setCam(!!d.preferences.camOnJoin);
          setTxPref(!!d.preferences.liveTranscript);
        }
      })
      .catch(() => {});
  }, [session?.user]);

  const enumerateDevices = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach(t => t.stop());
      const devs = await navigator.mediaDevices.enumerateDevices();
      setDevices(devs);
      if (!selectedMic) {
        const mic = devs.find(d => d.kind === 'audioinput');
        if (mic) setSelectedMic(mic.deviceId);
      }
      if (!selectedCam) {
        const cam = devs.find(d => d.kind === 'videoinput');
        if (cam) setSelectedCam(cam.deviceId);
      }
      if (!selectedSpeaker) {
        const spk = devs.find(d => d.kind === 'audiooutput');
        if (spk) setSelectedSpeaker(spk.deviceId);
      }
    } catch (e) { console.error('Device enumeration error:', e); }
  }, [selectedMic, selectedCam, selectedSpeaker]);

  useEffect(() => { enumerateDevices(); }, []);

  // Fetch once, then re-poll every 20 s: the host may move the meeting while someone is
  // already waiting here, and the waiting person must see the new time, not the old one.
  const firstSchedRef = useRef<string | null | undefined>(undefined);
  const [timeMoved, setTimeMoved] = useState(false);
  useEffect(() => {
    if (id === 'quick') return;
    let cancelled = false;
    const load = () => fetch(`/api/meetings/${id}`)
      .then((r) => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then((m: any) => {
        if (cancelled) return;
        const sched = m.scheduledAt ?? null;
        if (firstSchedRef.current === undefined) firstSchedRef.current = sched;
        else if (sched !== firstSchedRef.current) setTimeMoved(true);
        setMeeting(m);
      })
      .catch(console.error);
    load();
    const i = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(i); };
  }, [id]);

  // Re-evaluate the "too early" gate on a timer so the join button unlocks once the
  // 5-minutes-before window opens, without a manual refresh.
  useEffect(() => {
    const i = setInterval(() => setNowTs(Date.now()), 20000);
    return () => clearInterval(i);
  }, []);

  const joinMeeting = (startNow = false) => {
    const params = new URLSearchParams();
    if (!mic) params.set('mic', '0');
    if (!cam) params.set('cam', '0');
    if (!session?.user && name) params.set('guest', name);
    if (selectedMic) params.set('micId', selectedMic);
    if (selectedCam) params.set('camId', selectedCam);
    if (selectedSpeaker) params.set('spkId', selectedSpeaker);
    if (txPref) params.set('tx', '1');
    if (startNow) params.set('start', '1');
    const qs = params.toString();
    router.push(`/room/${id}${qs ? '?' + qs : ''}`);
  };

  // Entry gate (mirrors the server check in join-token): a still-scheduled meeting
  // opens 5 min before its start; earlier, only the host/admin sees "Start now".
  const uid = session?.user?.id;
  const role = session?.user?.role;
  const isHost = !!uid && (meeting?.createdById === uid || role === 'admin');
  const schedMs = meeting?.scheduledAt ? new Date(meeting.scheduledAt).getTime() : null;
  const tooEarly = schedMs != null && meeting?.status === 'scheduled' && nowTs < schedMs - 5 * 60_000;

  const getParticipantNames = (m: any) =>
    (m.participants || []).map((p: any) => ({
      name: p.user?.name || p.guestName || 'Guest',
      image: p.user?.image || null,
    }));

  return (
    <div className={s.root}>
      <div className={`lobby-header ${s.header}`}>
        <Logo />
        <button className="btn btn-ghost" onClick={() => router.push('/')}>
          <X size={15} /> {t('lobby.leave')}
        </button>
      </div>

      <div className={s.centerWrap}>
        <div className={`lobby-grid ${s.grid}`}>
          {/* Video preview */}
          <div>
            <MediaPreview
              mic={mic}
              cam={cam}
              userName={name || session?.user?.name || 'U'}
              userInitial={session?.user?.name?.[0] || 'U'}
              selectedMic={selectedMic}
              selectedCam={selectedCam}
            />

            <div className={s.controlsRow}>
              <LobbyControlBtn active={mic} onClick={() => setMic(!mic)}
                icon={mic ? <Mic size={20} /> : <MicOff size={20} />} />
              <LobbyControlBtn active={cam} onClick={() => setCam(!cam)}
                icon={cam ? <Video size={20} /> : <VideoOff size={20} />} />
              <div className={s.deviceWrap}>
                <button className={`btn ${s.deviceBtn}`} onClick={() => { enumerateDevices(); setShowDevices(!showDevices); }}
                  style={{ background: showDevices ? 'var(--surface-3)' : undefined }}>
                  <Settings size={15} /> {t('lobby.devices')} <ChevronDown size={13} className={s.chevron} style={{ transform: showDevices ? 'rotate(180deg)' : 'none' }} />
                </button>
                {showDevices && (
                  <>
                    <div onClick={() => setShowDevices(false)} className={s.deviceOverlay} />
                    <div className={s.devicePanel}>
                      <DeviceSelect label={t('lobby.microphone')} icon={<Mic size={14} />}
                        devices={devices.filter(d => d.kind === 'audioinput')}
                        value={selectedMic} onChange={setSelectedMic} />
                      <DeviceSelect label={t('lobby.camera')} icon={<Video size={14} />}
                        devices={devices.filter(d => d.kind === 'videoinput')}
                        value={selectedCam} onChange={setSelectedCam} />
                      <DeviceSelect label={t('lobby.speakers')} icon={<Volume2 size={14} />}
                        devices={devices.filter(d => d.kind === 'audiooutput')}
                        value={selectedSpeaker} onChange={setSelectedSpeaker} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: meeting info + join */}
          <div className={s.infoCol}>
            {meeting ? (
              <>
                <div>
                  {meeting.scheduledAt && (
                    <div className={s.scheduledLabel}>
                      {fmtRelative(new Date(meeting.scheduledAt), locale)} &bull; {fmtTime(new Date(meeting.scheduledAt))}
                    </div>
                  )}
                  {timeMoved && meeting.scheduledAt && (
                    <div className={s.timeMoved} role="status">
                      <Clock size={13} /> {t('lobby.timeChanged', { time: fmtTime(new Date(meeting.scheduledAt)) })}
                    </div>
                  )}
                  <h1 className={s.title}>
                    {meeting.title}
                  </h1>
                  {meeting.description && (
                    <p className={s.desc}>
                      {meeting.description}
                    </p>
                  )}
                  <div className={s.metaRow}>
                    <Users size={13} /> {t('lobby.invitedCount', { count: meeting.participants?.length || 0 })}
                    <span>&bull;</span>
                    <Clock size={13} /> {t('common.minutes', { count: meeting.durationMin })}
                  </div>
                </div>

                {Array.isArray(meeting.agenda) && meeting.agenda.filter((x: unknown) => typeof x === 'string' && x.trim()).length > 0 && (
                  <div className={s.panel}>
                    <div className={s.panelHeadingAgenda}>
                      <ListChecks size={13} /> {t('schedule.agendaHeading')}
                    </div>
                    <div className={s.agendaList}>
                      {(meeting.agenda as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((item, idx) => (
                        <div key={idx} className={s.agendaItem}>
                          <span className={s.agendaBadge}>{idx + 1}</span>
                          <span className={s.agendaText}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {meeting.participants && meeting.participants.length > 0 && (
                  <div className={s.panel}>
                    <div className={s.panelHeadingParticipants}>
                      {t('lobby.participantsHeading')}
                    </div>
                    <div className={s.participantsRow}>
                      <AvatarStack users={getParticipantNames(meeting)} size="md" max={3} />
                      <div className={s.participantsCount}>
                        {t('common.participants', { count: meeting.participants.length })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div>
                <h1 className={s.title}>
                  {id === 'quick' ? t('lobby.quickMeeting') : t('lobby.joinMeeting')}
                </h1>
                <p className={s.descNoMargin}>
                  {id === 'quick'
                    ? t('lobby.quickMeetingDesc')
                    : t('lobby.loadingMeeting')}
                </p>
              </div>
            )}

            <div>
              <label className="field-label">{t('lobby.yourName')}</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t('lobby.namePlaceholder')} />
            </div>

            {tooEarly ? (
              isHost ? (
                <>
                  <button className={`btn btn-primary ${s.primaryBtn}`} onClick={() => joinMeeting(true)}>
                    <Video size={17} /> {t('lobby.startNow')}
                  </button>
                  <div className={s.hostNote}>
                    <Clock size={13} /> {t('lobby.earlyHostNote', { time: fmtTime(new Date(meeting.scheduledAt)) })}
                  </div>
                </>
              ) : (
                <div className={s.tooEarlyBox}>
                  <div className={s.tooEarlyHeader}>
                    <Clock size={16} className={s.accentIcon} /> {t('lobby.tooEarlyTitle')}
                  </div>
                  <div className={s.tooEarlyDesc}>
                    {t('lobby.tooEarlyDesc', { time: fmtTime(new Date(meeting.scheduledAt)) })}
                  </div>
                </div>
              )
            ) : (
              <button className={`btn btn-primary ${s.primaryBtn}`} onClick={() => joinMeeting()}>
                <Video size={17} /> {t('lobby.joinMeeting')}
              </button>
            )}

            <div className={s.encryptedRow}>
              <Lock size={12} /> {t('lobby.encryptedNote')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MEDIA PREVIEW — real camera + real mic level
   ══════════════════════════════════════════════════════════ */
function DeviceSelect({ label, icon, devices, value, onChange }: {
  label: string; icon: React.ReactNode; devices: MediaDeviceInfo[];
  value: string; onChange: (id: string) => void;
}) {
  const t = useTranslations();
  return (
    <div className={s.deviceFieldWrap}>
      <div className={s.deviceFieldLabel}>
        {icon} {label}
      </div>
      <Select
        value={value}
        onChange={onChange}
        placeholder={t('lobby.deviceNotFound')}
        style={{ background: 'var(--surface-2)' }}
        options={devices.map(d => ({ value: d.deviceId, label: d.label || t('lobby.deviceFallback', { id: d.deviceId.slice(0, 6) }) }))}
      />
    </div>
  );
}

function MediaPreview({ mic, cam, userName, userInitial, selectedMic, selectedCam }: {
  mic: boolean; cam: boolean; userName: string; userInitial: string;
  selectedMic?: string; selectedCam?: string;
}) {
  const t = useTranslations();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micBarRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  /* ── Camera stream ───────────────────────── */
  useEffect(() => {
    if (!cam) {
      // Stop camera tracks
      if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach(t => t.stop());
        // Keep audio tracks if mic is on
        if (!mic) {
          streamRef.current.getAudioTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: selectedCam
            ? { deviceId: { exact: selectedCam }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: mic ? (selectedMic ? { deviceId: { exact: selectedMic } } : true) : false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Camera access error:', err);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam, selectedCam]);

  /* ── Mic analyser (real levels, DOM-direct updates) ── */
  useEffect(() => {
    if (!mic) {
      // Stop audio
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(t => t.stop());
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
        analyserRef.current = null;
      }
      cancelAnimationFrame(rafRef.current);
      if (micBarRef.current) micBarRef.current.style.width = '0%';
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Get audio stream (reuse existing or create new)
        let stream = streamRef.current;
        if (!stream || stream.getAudioTracks().length === 0) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: selectedMic ? { deviceId: { exact: selectedMic } } : true });
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
          // Merge with existing video stream if present
          if (streamRef.current) {
            stream.getAudioTracks().forEach(t => streamRef.current!.addTrack(t));
          } else {
            streamRef.current = stream;
          }
        }

        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);

        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(dataArray);
          // Average of lower frequencies (voice range)
          let sum = 0;
          const count = Math.min(40, dataArray.length);
          for (let i = 0; i < count; i++) sum += dataArray[i];
          const avg = sum / count / 255;
          // Direct DOM update — no setState, no re-render
          if (micBarRef.current) {
            micBarRef.current.style.width = `${Math.min(avg * 2.5, 1) * 100}%`;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        console.error('Mic access error:', err);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic, selectedMic]);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div className={s.previewBox} style={{ background: 'linear-gradient(135deg, #1d2735 0%, #0f1722 100%)' }}>
      {/* Real camera video */}
      {cam && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={s.video}
        />
      )}

      {/* Camera off placeholder */}
      {!cam && (
        <div className={s.placeholder}>
          <div className={`avatar avatar-lg ${s.avatarCircle}`}>
            {userInitial}
          </div>
          <div className={s.cameraOffLabel}>{t('lobby.cameraOff')}</div>
        </div>
      )}

      {/* Bottom bar: mic level + name */}
      <div className={s.bottomBar} style={{ background: 'rgba(0,0,0,.45)' }}>
        {mic ? (
          <Mic size={14} className={s.micIconOn} />
        ) : (
          <MicOff size={14} className={s.micIconOff} />
        )}
        <div className={s.micTrack} style={{ background: 'rgba(255,255,255,.15)' }}>
          <div
            ref={micBarRef}
            className={s.micFill}
            style={{ background: 'linear-gradient(90deg, #22c55e, #eab308)' }}
          />
        </div>
        <span className={s.userNameLabel}>{userName}</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
function LobbyControlBtn({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className={s.controlBtn} style={{
      background: active ? 'var(--surface-2)' : 'color-mix(in oklab, var(--red) 22%, var(--surface))',
      color: active ? 'var(--text)' : '#fca5a5',
      border: `1px solid ${active ? 'var(--border)' : 'color-mix(in oklab, var(--red) 40%, var(--border))'}`,
    }}>
      {icon}
    </button>
  );
}
