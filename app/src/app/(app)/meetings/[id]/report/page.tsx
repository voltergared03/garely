'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import {
  ChevronLeft, Sparkles, Copy, Send, FileText, Check, Clock,
  Users, Search, X, ChevronRight, Video, Play, ListChecks,
  CheckCircle, Download, ChevronDown, User, Loader2, Trash2, Bookmark, Languages, HelpCircle,
  MessageCircle, AlertCircle} from 'lucide-react';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { fmtTime, fmtRelative, fmtDateLong, getInitials, getAvatarColor } from '@/lib/utils';
import { useWorkspaceTz } from '@/hooks/use-workspace-tz';
import type {
  Participant,
  SpeakerTrackItem,
  TranscriptSegment,
  ActionItem,
  UserItem,
  AssignOption,
  Topic,
  Report,
  Meeting,
} from './lib/types';
import { transformApiData, formatTimestamp } from './lib/transform';
import { useSaveErrorToast } from '@/components/save-toast';
import { ReportAssigneeDropdown } from './components/ReportAssigneeDropdown';
import { PriorityChip } from './components/PriorityChip';
import { ReportCard } from './components/ReportCard';
import { HighlightText } from './components/HighlightText';
import { QuizManager } from './components/QuizManager';
import css from './page.module.css';

/* ─── Main page component ───────────────────────────────────────── */

export default function MeetingReportPage() {
  const tr = useTranslations();
  const { showSaveError, saveToast } = useSaveErrorToast();
  const locale = useLocale();
  const tz = useWorkspaceTz();
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'detailed' | 'transcript' | 'chat'>('summary');
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [recording, setRecording] = useState<any>(null);
  const [recBusy, setRecBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tracks, setTracks] = useState<SpeakerTrackItem[]>([]);
  const [meetingCreatorId, setMeetingCreatorId] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixMsg, setFixMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [trackLangSel, setTrackLangSel] = useState<Record<string, string>>({});
  // Ephemeral meeting chat — kept in memory only, cleared on reload.
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatTaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/meetings/${meetingId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            // Transform API data to match page interfaces
            const transformed = transformApiData(data);
            setMeeting(transformed);
            setMeetingCreatorId(data.createdById ?? data.createdBy?.id ?? null);
            setReportStatus(data.reportStatus ?? null);
            if (transformed.reports?.[0]?.actionItems) {
              setActionItems(transformed.reports[0].actionItems);
            }
          }
        } else {
          if (!cancelled) setMeeting(null);
        }
      } catch {
        if (!cancelled) setMeeting(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [meetingId]);

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setUsers(data); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch(`/api/meetings/${meetingId}/recording`)
      .then((r) => r.json())
      .then((d) => setRecording(d.recording || null))
      .catch(() => {});
  }, [meetingId]);

  // Re-fetch the meeting (transcript + report) after a language fix.
  const reloadMeeting = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}`);
      if (res.ok) {
        const data = await res.json();
        const transformed = transformApiData(data);
        setMeeting(transformed);
        setMeetingCreatorId(data.createdById ?? data.createdBy?.id ?? null);
        setReportStatus(data.reportStatus ?? null);
        if (transformed.reports?.[0]?.actionItems) {
          setActionItems(transformed.reports[0].actionItems);
        }
      }
    } catch { /* ignore */ }
  }, [meetingId]);

  const loadTracks = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/speaker-tracks`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setTracks(data);
      }
    } catch { /* ignore */ }
  }, [meetingId]);

  useEffect(() => { loadTracks(); }, [loadTracks]);

  const runFixLanguage = useCallback(async (trackId: string) => {
    const language = trackLangSel[trackId];
    if (!language || fixingId) return;
    setFixingId(trackId);
    setFixMsg(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/fix-language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, language }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setFixMsg({ ok: true, text: d.warning || tr('report.fixLangDone') });
        await Promise.all([reloadMeeting(), loadTracks()]);
      } else {
        const text = res.status === 422 ? tr('report.fixLangNoSpeech') : (d.error || tr('report.fixLangFailed'));
        setFixMsg({ ok: false, text });
      }
    } catch {
      setFixMsg({ ok: false, text: tr('report.fixLangFailed') });
    } finally {
      setFixingId(null);
      setTimeout(() => setFixMsg(null), 6000);
    }
  }, [meetingId, trackLangSel, fixingId, reloadMeeting, loadTracks, tr]);

  const sendReport = useCallback(async () => {
    setSending(true); setSendMsg(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/send-report`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      setSendMsg(res.ok ? { ok: true, text: tr('report.sentToParticipants', { count: d.recipients }) } : { ok: false, text: d.error || tr('report.error') });
    } catch { setSendMsg({ ok: false, text: tr('report.networkError') }); }
    finally { setSending(false); setTimeout(() => setSendMsg(null), 5000); }
  }, [meetingId]);

  const toggleRecordingPermanent = useCallback(async () => {
    if (!recording) return;
    setRecBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/recording`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permanent: !recording.permanent }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.recording) setRecording(d.recording);
    } catch { /* ignore */ } finally { setRecBusy(false); }
  }, [meetingId, recording]);

  const deleteRecording = useCallback(async () => {
    if (!recording) return;
    if (!window.confirm(tr('report.deleteRecordingConfirm'))) return;
    setRecBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/recording`, { method: 'DELETE' });
      if (res.ok) setRecording(null);
    } catch { /* ignore */ } finally { setRecBusy(false); }
  }, [meetingId, recording]);

  // Toggle one assignee on a report task. Registered users add/remove in the
  // multi-assignee set (виконавці) via /assignees; a guest (no account) can't
  // join the set, so it replaces the set as the sole lead (legacy behaviour).
  const toggleAssignee = useCallback(async (itemId: string, opt: AssignOption, isSelected: boolean) => {
    const prevItems = actionItems; // snapshot for revert if the write is rejected
    if (opt.id) {
      setActionItems((prev) =>
        prev.map((item) => {
          if (item.id !== itemId) return item;
          const cur = item.assignees || [];
          const next = isSelected
            ? cur.filter((a) => a.id !== opt.id)
            : [...cur, { id: opt.id as string, name: opt.name, image: opt.image || null, registered: true }];
          return { ...item, assignees: next, assignee: next[0]?.name || '', assigneeImage: next[0]?.image ?? null, assigneeRegistered: next[0] ? next[0].registered : false };
        })
      );
      try {
        const res = isSelected
          ? await fetch(`/api/tasks/${itemId}/assignees?userId=${opt.id}`, { method: 'DELETE' })
          : await fetch(`/api/tasks/${itemId}/assignees`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: opt.id }) });
        if (!res.ok) { setActionItems(prevItems); showSaveError(tr('common.saveFailed')); } // rejected → revert the optimistic assignee change
      } catch (e) { console.error(e); setActionItems(prevItems); showSaveError(tr('common.saveFailed')); }
    } else {
      setActionItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, assignees: [{ id: null, name: opt.name, image: opt.image || null, registered: false }], assignee: opt.name, assigneeImage: opt.image || null, assigneeRegistered: false }
            : item
        )
      );
      try {
        const res = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: itemId, assigneeIds: [] }) });
        if (!res.ok) { setActionItems(prevItems); showSaveError(tr('common.saveFailed')); }
      } catch (e) { console.error(e); setActionItems(prevItems); showSaveError(tr('common.saveFailed')); }
    }
  }, [actionItems, showSaveError, tr]);

  // Jump from an extended-report citation to the cited moment in the transcript.
  const jumpToTime = useCallback((t: number) => {
    setSearchQuery('');
    setActiveTab('transcript');
    const list = meeting?.transcripts || [];
    let bestIdx = -1;
    let bestDiff = Infinity;
    list.forEach((s, i) => {
      const d = Math.abs((s.startTime || 0) - t);
      if (d < bestDiff) { bestDiff = d; bestIdx = i; }
    });
    if (bestIdx < 0) return;
    // The transcript tab may not have painted yet (long list, or first switch
    // from another tab), so retry across a few frames until the target row
    // exists, then scroll. A second instant re-center corrects for any late
    // layout shift (e.g. the fix-language panel rendering in above the list).
    let tries = 0;
    const tryScroll = () => {
      const el = document.getElementById(`seg-${bestIdx}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('seg-highlight');
        setTimeout(() => el.classList.remove('seg-highlight'), 1800);
        setTimeout(() => el.scrollIntoView({ behavior: 'auto', block: 'center' }), 280);
      } else if (tries++ < 20) {
        setTimeout(tryScroll, 50);
      }
    };
    setTimeout(tryScroll, 60);
  }, [meeting]);

  // Auto-scroll the chat to the latest message as it streams in.
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatBusy]);

  // Auto-grow the chat composer up to a max height (resets when cleared);
  // only show a scrollbar once it hits the cap so the empty box stays clean.
  useEffect(() => {
    const ta = chatTaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
      ta.style.overflowY = ta.scrollHeight > 140 ? 'auto' : 'hidden';
    }
  }, [chatInput, activeTab]);

  // Send a chat turn and stream the assistant's reply. `override` lets a
  // suggestion chip ask its question directly without typing.
  const sendChat = useCallback(
    async (override?: string) => {
      const q = (override ?? chatInput).trim();
      if (!q || chatBusy) return;
      const next: { role: 'user' | 'assistant'; content: string }[] = [
        ...chatMessages,
        { role: 'user', content: q },
      ];
      // Show the user message + an empty assistant bubble to stream into.
      setChatMessages([...next, { role: 'assistant', content: '' }]);
      setChatInput('');
      setChatBusy(true);
      const ac = new AbortController();
      chatAbortRef.current = ac;
      const setLastAssistant = (content: string) =>
        setChatMessages((prev) => {
          const copy = [...prev];
          if (copy.length && copy[copy.length - 1].role === 'assistant') {
            copy[copy.length - 1] = { role: 'assistant', content };
          }
          return copy;
        });
      try {
        const res = await fetch(`/api/meetings/${meetingId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const d = await res.json().catch(() => ({} as any));
          setLastAssistant(
            res.status === 422 ? tr('report.chatNoTranscript') : tr('report.chatError')
          );
          if (d?.error) console.error('chat error:', d.error);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setLastAssistant(acc);
        }
        if (!acc.trim()) setLastAssistant(tr('report.chatEmpty'));
      } catch (e: any) {
        if (e?.name !== 'AbortError') setLastAssistant(tr('report.chatError'));
      } finally {
        setChatBusy(false);
        chatAbortRef.current = null;
      }
    },
    [chatInput, chatBusy, chatMessages, meetingId, tr]
  );

  const clearChat = useCallback(() => {
    chatAbortRef.current?.abort();
    setChatMessages([]);
    setChatInput('');
    setChatBusy(false);
  }, []);

  const report = meeting?.reports?.[0] ?? null;

  // While the report is still being generated, poll until it's ready or failed.
  useEffect(() => {
    if (report || reportStatus !== 'generating') return;
    const iv = setInterval(() => { reloadMeeting(); }, 5000);
    return () => clearInterval(iv);
  }, [report, reportStatus, reloadMeeting]);

  const canRetryReport = isAdmin || (!!session?.user?.id && session.user.id === meetingCreatorId);

  // Retry a failed generation: flip to "generating" (which shows the spinner and
  // starts the poll above) and kick the regenerate endpoint.
  const retryReport = useCallback(async () => {
    setReportStatus('generating');
    try {
      await fetch(`/api/meetings/${meetingId}/regenerate`, { method: 'POST' });
    } catch { /* the poll will reflect the outcome */ }
  }, [meetingId]);
  const isHost = !!meetingCreatorId && session?.user?.id === meetingCreatorId;
  const canFixLanguage = isAdmin || isHost;
  // The reassignment dropdown lists the registered users who were on THIS meeting.
  // Reassign dropdown options: registered participants + guests (people who
  // joined by name — found in the participant list and/or as transcript speakers
  // with no account).
  // Registered users on this meeting, deduped by User.id. Start from the participant
  // rows, then fold in anyone who SPOKE with a registered account (transcript segments
  // carry speakerId) — a registered speaker who joined under a display name unlike their
  // account name used to be mislabeled an unregistered guest, so key on the id, not the name.
  const regById = new Map<string, AssignOption>();
  for (const p of meeting?.participants || []) {
    if (p.user) regById.set(p.user.id, { id: p.user.id, name: p.user.name, email: p.user.email || '', image: p.user.image });
  }
  for (const s of meeting?.transcripts || []) {
    if (s.speakerId && !regById.has(s.speakerId)) {
      regById.set(s.speakerId, { id: s.speakerId, name: s.speakerUserName || s.speakerName || tr('report.unknownSpeaker'), email: '', image: s.speakerImage ?? null });
    }
  }
  const regParticipants: AssignOption[] = [...regById.values()];
  const regNameSet = new Set(regParticipants.map((u) => u.name.toLowerCase()));
  // Guests = people with NO account: guest participants + transcript speakers that have
  // no speakerId. A speaker WITH a speakerId is registered (handled above) and must never
  // fall through to a guest entry, regardless of what display name they spoke under.
  const guestNameSet = new Set<string>();
  for (const p of meeting?.participants || []) if (!p.user && p.guestName) guestNameSet.add(p.guestName);
  for (const s of meeting?.transcripts || []) if (!s.speakerId && s.speakerName) guestNameSet.add(s.speakerName);
  const guestOptions: AssignOption[] = [...guestNameSet]
    .filter((n) => n && !regNameSet.has(n.toLowerCase()))
    .map((n) => ({ id: null, name: n, guest: true }));
  const assignOptions: AssignOption[] = [...regParticipants, ...guestOptions];

  // Toggle an action item done/open AND persist it to the same /api/tasks status
  // the board uses, so the report and the Tasks board stay in sync (was local-only
  // before — the report checkbox never wrote, so changes never reached the board).
  const toggleActionItem = useCallback(async (id: string) => {
    const item = actionItems.find((i) => i.id === id);
    if (!item || item.clickupManaged || item.linearManaged) return; // managed in ClickUp/Linear — read-only mirror
    const nextStatus: 'open' | 'done' = item.done ? 'open' : 'done';
    const prevItems = actionItems;
    setActionItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, done: nextStatus === 'done', status: nextStatus } : i))
    );
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: id, status: nextStatus }),
      });
      if (!res.ok) { setActionItems(prevItems); showSaveError(tr('common.saveFailed')); } // revert + surface on failure
    } catch (e) {
      console.error(e);
      setActionItems(prevItems);
      showSaveError(tr('common.saveFailed'));
    }
  }, [actionItems, showSaveError, tr]);

  const deleteActionItem = useCallback(async (id: string, mirrored = false) => {
    // A mirrored item also destroys every assignee's ClickUp copy, so say that rather
    // than reuse the plain "delete this item?" wording.
    if (!window.confirm(mirrored ? tr('tasks.confirmDeleteMirrored') : tr('report.deleteActionItemConfirm'))) return;
    const prevItems = actionItems;
    setActionItems((prev) => prev.filter((item) => item.id !== id));
    try {
      const res = await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: id }),
      });
      if (!res.ok) {
        setActionItems(prevItems); // delete rejected → put it back
        // Surface the server's reason (403 not admin/assignee, 502 some ClickUp copies
        // survived) instead of a generic "couldn't save".
        const msg = await res.json().then((d) => d?.error).catch(() => null);
        showSaveError(msg || tr('common.saveFailed'));
      }
    } catch (e) { console.error(e); setActionItems(prevItems); showSaveError(tr('common.saveFailed')); }
  }, [actionItems, showSaveError, tr]);

  const copySummary = useCallback(() => {
    if (!report) return;
    const text = [
      `# ${meeting?.title}`,
      '',
      `## ${tr('report.summary')}`,
      report.summary,
      '',
      '## Action Items',
      ...actionItems.map((a) => `- [${a.done ? 'x' : ' '}] ${a.text} (@${a.assignee})`),
      '',
      '## Decisions',
      ...report.decisions.map((d, i) => `${i + 1}. ${d}`),
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report, meeting, actionItems]);

  const filteredTranscripts = useMemo(() => {
    if (!meeting) return [];
    if (!searchQuery.trim()) return meeting.transcripts;
    const q = searchQuery.toLowerCase();
    return meeting.transcripts.filter(
      (t) => t.text.toLowerCase().includes(q) || t.speakerName.toLowerCase().includes(q)
    );
  }, [meeting, searchQuery]);

  const copyAllTranscript = useCallback(() => {
    if (!meeting) return;
    const text = meeting.transcripts
      .map((t) => `[${t.timestamp}] ${t.speakerName} (${t.language.toUpperCase()}): ${t.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  }, [meeting]);

  const participantNames = useMemo(() => {
    if (!meeting) return [];
    return meeting.participants.map((p) => ({
      name: p.user?.name || p.guestName || 'Guest',
      image: p.user?.image || null,
    }));
  }, [meeting]);

  /* ─── Computed analytics from real data ─────────────────────── */
  const analytics = useMemo(() => {
    if (!meeting) return null;
    const transcripts = meeting.transcripts || [];
    const rep = meeting.reports?.[0];

    // If mock data already has analytics, use it directly
    if (rep?.analytics) return rep.analytics;

    // durationMin is already resolved reliably in transformApiData
    // (transcript span → sanity-guarded elapsed → planned), so reuse it here
    // instead of recomputing from the unreliable scheduled time.
    const durationMin = meeting.durationMin || 0;

    // Word count from transcripts
    const wordsCount = transcripts.reduce((sum: number, t: any) => sum + (t.text || '').split(/\s+/).filter(Boolean).length, 0);

    // Replies count
    const repliesCount = transcripts.length;

    // Language distribution
    const langMap: Record<string, number> = {};
    transcripts.forEach((t: any) => {
      const lang = (t.language || 'uk').toLowerCase().replace('uk', 'ua');
      langMap[lang] = (langMap[lang] || 0) + (t.text || '').length;
    });
    const totalChars = Object.values(langMap).reduce((a: number, b: number) => a + b, 0) || 1;
    const langColors: Record<string, string> = { ua: 'var(--warn)', en: 'var(--success)', ru: 'var(--purple)', pt: '#f472b6', hi: '#fb923c' };
    const langLabels: Record<string, string> = { ua: tr('report.langUk'), en: tr('report.langEn'), ru: tr('report.langRu'), pt: tr('report.langPt'), hi: tr('report.langHi') };
    const languages = Object.entries(langMap)
      .sort((a, b) => b[1] - a[1])
      .map(([code, chars]) => ({
        label: langLabels[code] || code.toUpperCase(),
        code: code.toUpperCase(),
        pct: Math.round((chars / totalChars) * 100),
        color: langColors[code] || '#94a3b8',
      }));

    // Speaker distribution
    const speakerMap: Record<string, { chars: number; image: string | null }> = {};
    transcripts.forEach((t: any) => {
      const name = t.speakerName || 'Unknown';
      if (!speakerMap[name]) speakerMap[name] = { chars: 0, image: (t as any).speakerImage || null };
      speakerMap[name].chars += (t.text || '').length;
    });
    const totalSpeakerChars = Object.values(speakerMap).reduce((a: number, b) => a + b.chars, 0) || 1;
    const speakers = Object.entries(speakerMap)
      .sort((a, b) => b[1].chars - a[1].chars)
      .map(([name, data]) => ({
        name,
        image: data.image,
        pct: Math.round((data.chars / totalSpeakerChars) * 100),
      }));

    return {
      durationMin,
      wordsCount,
      repliesCount,
      languagesCount: languages.length || 1,
      languages: languages.length > 0 ? languages : [{ label: tr('report.langUk'), code: 'UA', pct: 100, color: 'var(--warn)' }],
      speakers,
    };
  }, [meeting]);

  const downloadPdf = useCallback(() => {
    if (!meeting || !report) return;

    const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const participants = meeting.participants.map(p => p.user?.name || p.guestName || 'Guest');

    const dateStr = meeting.scheduledAt
      ? new Date(meeting.scheduledAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz })
      : '';
    const timeStr = meeting.scheduledAt
      ? new Date(meeting.scheduledAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: tz })
      : '';

    const initials = (name: string) => {
      const p = name.trim().split(/\s+/);
      return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
    };

    const prioTag = (p: string) => {
      if (p === 'high') return `<span class="tag tag-red">${tr('report.priorityHigh')}</span>`;
      if (p === 'medium') return `<span class="tag tag-amber">${tr('report.priorityMedium')}</span>`;
      return `<span class="tag tag-gray">${tr('report.priorityLow')}</span>`;
    };

    const statusTag = (done: boolean) => done
      ? `<span class="tag tag-green">${tr('report.statusDone')}</span>`
      : `<span class="tag tag-outline">${tr('report.statusOpen')}</span>`;

    // Build sections
    const summaryPs = report.summary.split('\n').filter(p => p.trim()).map(p => `<p>${esc(p)}</p>`).join('');

    const decisionsHtml = report.decisions.length > 0
      ? report.decisions.map((d, i) =>
          `<div class="dec"><div class="dec-n">${i + 1}</div><div class="dec-t">${esc(d)}</div></div>`
        ).join('')
      : '';

    const itemsRows = actionItems.length > 0
      ? actionItems.map((a, i) =>
          `<tr${i % 2 === 0 ? '' : ' class="alt"'}>
            <td class="td-task">${esc(a.text)}</td>
            <td><div class="asgn"><span class="av">${initials(a.assignee)}</span>${esc(a.assignee)}</div></td>
            <td>${prioTag(a.priority)}</td>
            <td>${statusTag(a.done)}</td>
          </tr>`
        ).join('')
      : '';

    const followUps = (report.followUps || []).length > 0
      ? (report.followUps || []).map(f => `<li>${esc(f)}</li>`).join('')
      : '';

    // Extended (topic-structured) report.
    const topicsHtml = (report.topics || []).length > 0
      ? (report.topics || []).map((t, i) => {
          const sub = (label: string, items: string, cls: string) =>
            items ? `<div class="tp-sub"><div class="tp-sub-h ${cls}">${label}</div><ul class="tp-list">${items}</ul></div>` : '';
          const decs = (t.decisions || []).map(d => `<li>${esc(d.text)}${d.owner ? ` <span class="tp-owner">— ${esc(d.owner)}</span>` : ''}</li>`).join('');
          const tks = (t.tasks || []).map(k => `<li>${esc(k.title)}${k.assignee ? ` <span class="tp-owner">— ${esc(k.assignee)}</span>` : ''}</li>`).join('');
          const qs = (t.openQuestions || []).map(q => `<li>${esc(q.text)}</li>`).join('');
          return `<div class="topic">
            <div class="tp-head"><span class="tp-n">${i + 1}</span><span class="tp-title">${esc(t.title)}</span></div>
            ${t.discussion ? `<p class="tp-disc">${esc(t.discussion)}</p>` : ''}
            ${sub(tr('report.decisions'), decs, 'dh-green')}
            ${sub(tr('report.detailTasks'), tks, 'dh-blue')}
            ${sub(tr('report.openQuestions'), qs, 'dh-amber')}
          </div>`;
        }).join('')
      : '';

    const avatarsHtml = participants.slice(0, 8).map(n =>
      `<span class="pav">${initials(n)}</span>`
    ).join('');

    // Used in the header meta line ("X хв"); the analytics section is omitted.
    const dur = analytics?.durationMin || meeting.durationMin || 0;

    const html = `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"/>
<title>${esc(meeting.title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
@page{margin:18mm 16mm;size:A4}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',system-ui,sans-serif;font-size:9.5pt;color:#1e293b;line-height:1.6;background:#f1f5f9;
-webkit-print-color-adjust:exact;print-color-adjust:exact}

.wrap{max-width:680px;margin:32px auto;padding:36px 40px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
@media print{body{background:#f1f5f9}.wrap{margin:16px auto;max-width:680px;padding:36px 40px}}
/* ─ Cover ─ */
.cover{position:relative;padding:32px 0 24px;margin-bottom:6px}
.cover::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;
background:linear-gradient(90deg,var(--accent) 0%,var(--accent) 30%,#e2e8f0 30%,#e2e8f0 100%)}
.brand{font-family:'DM Mono',monospace;font-size:7pt;font-weight:500;color:#94a3b8;
text-transform:uppercase;letter-spacing:0.18em;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.brand::before{content:'';display:inline-block;width:8px;height:8px;background:var(--accent);border-radius:2px}
.cover h1{font-size:22pt;font-weight:700;color:#0f172a;letter-spacing:-0.03em;line-height:1.15;margin-bottom:12px}
.cover-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.cmeta{font-family:'DM Mono',monospace;font-size:7.5pt;color:#64748b;display:flex;align-items:center;gap:5px}
.cmeta svg{width:12px;height:12px;stroke:#94a3b8;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.avatars{display:flex;margin-left:auto}
.pav{width:26px;height:26px;border-radius:50%;font-size:7pt;font-weight:600;
color:#fff;display:inline-flex;align-items:center;justify-content:center;
margin-left:-6px;border:2px solid #fff;position:relative}
.pav:nth-child(6n+1){background:var(--accent)}
.pav:nth-child(6n+2){background:#8b5cf6}
.pav:nth-child(6n+3){background:#06b6d4}
.pav:nth-child(6n+4){background:var(--warn)}
.pav:nth-child(6n+5){background:var(--success)}
.pav:nth-child(6n+6){background:var(--danger)}
.pav:first-child{margin-left:0}

/* ─ Section ─ */
.sec{margin-bottom:20px;break-inside:avoid}
.sec-title{font-family:'DM Mono',monospace;font-size:7pt;font-weight:500;color:var(--accent);
text-transform:uppercase;letter-spacing:0.15em;margin-bottom:10px;
display:flex;align-items:center;gap:8px}
.sec-title::after{content:'';flex:1;height:1px;background:#e2e8f0}

/* ─ Card ─ */
.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;margin-bottom:12px}
p{margin-bottom:6px;color:#334155;line-height:1.72;font-size:9.5pt}

/* ─ Stats ─ */
.stats{display:flex;gap:8px;margin-bottom:14px}
.st{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 10px;text-align:center}
.st-v{font-size:20pt;font-weight:700;color:#0f172a;letter-spacing:-0.02em;line-height:1}
.st-u{font-family:'DM Mono',monospace;font-size:6.5pt;color:#94a3b8;text-transform:uppercase;letter-spacing:0.12em;margin-top:5px}

/* ─ Decisions ─ */
.dec{display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f1f5f9}
.dec:last-child{border-bottom:none}
.dec-n{width:22px;height:22px;border-radius:6px;background:#eff6ff;color:var(--accent);
font-size:8pt;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid #dbeafe}
.dec-t{color:#334155;font-size:9.5pt;line-height:1.55;padding-top:1px}

/* ─ Table ─ */
.tbl-wrap{overflow:hidden;border-radius:8px;border:1px solid #e2e8f0}
table{width:100%;border-collapse:collapse;font-size:8.5pt}
th{text-align:left;padding:10px 14px;font-family:'DM Mono',monospace;font-size:6.5pt;font-weight:500;
color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;background:#f8fafc;border-bottom:1px solid #e2e8f0}
td{padding:10px 14px;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr.alt td{background:#fafbfc}
.td-task{font-weight:500;max-width:300px}
.asgn{display:flex;align-items:center;gap:6px;white-space:nowrap}
.av{width:20px;height:20px;border-radius:50%;font-size:6.5pt;font-weight:600;color:#fff;background:#64748b;
display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:7.5pt;font-weight:600;white-space:nowrap}
.tag-red{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
.tag-amber{background:#fffbeb;color:#d97706;border:1px solid #fde68a}
.tag-gray{background:#f8fafc;color:#64748b;border:1px solid #e2e8f0}
.tag-green{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0}
.tag-outline{background:#fff;color:#94a3b8;border:1px solid #e2e8f0}

/* ─ Follow-ups ─ */
ul.flu{list-style:none;margin:0;padding:0}
ul.flu li{padding:7px 0 7px 16px;position:relative;color:#334155;font-size:9pt;border-bottom:1px solid #f1f5f9}
ul.flu li:last-child{border-bottom:none}
ul.flu li::before{content:'';position:absolute;left:0;top:14px;width:5px;height:5px;border-radius:50%;background:var(--accent)}

/* ─ Speakers ─ */
.spk{display:flex;align-items:center;gap:8px;padding:4px 0}
.spk-name{width:110px;font-size:8.5pt;color:#64748b;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spk-track{flex:1;height:5px;background:#f1f5f9;border-radius:3px;overflow:hidden}
.spk-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:3px}
.spk-pct{width:32px;text-align:right;font-family:'DM Mono',monospace;font-size:7.5pt;color:#94a3b8;font-weight:500}

/* ─ Languages ─ */
.lng{display:flex;justify-content:space-between;padding:3px 0;font-size:8.5pt;color:#64748b}
.lng-pct{font-family:'DM Mono',monospace;font-weight:500;color:#94a3b8}

/* ─ Transcript ─ */
.tr-seg{padding:6px 0;border-bottom:1px solid #f1f5f9}
.tr-seg:last-child{border-bottom:none}
.tr-head{display:flex;align-items:center;gap:8px;margin-bottom:1px}
.tr-ts{font-family:'DM Mono',monospace;font-size:7pt;color:#94a3b8}
.tr-who{font-size:8.5pt;font-weight:600;color:#1e293b}
.tr-lang{font-family:'DM Mono',monospace;font-size:6pt;color:var(--accent);background:#eff6ff;padding:1px 4px;border-radius:3px;font-weight:500}
.tr-txt{font-size:8.5pt;color:#64748b;line-height:1.55}

/* ─ Footer ─ */
.foot{margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center}
.foot-l{font-family:'DM Mono',monospace;font-size:7pt;color:#94a3b8;display:flex;align-items:center;gap:6px}
.foot-l::before{content:'';display:inline-block;width:6px;height:6px;background:var(--accent);border-radius:1.5px}
.foot-r{font-family:'DM Mono',monospace;font-size:6.5pt;color:#cbd5e1;letter-spacing:0.03em}

/* ─ Two-col layout for analytics ─ */
.row2{display:flex;gap:12px}
.row2>.col{flex:1;min-width:0}

/* ─ Subtle label inside card ─ */
.card-label{font-family:'DM Mono',monospace;font-size:6.5pt;font-weight:500;color:#94a3b8;
text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px}

/* ─ Detailed report (topics) ─ */
.topic{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:10px;break-inside:avoid}
.tp-head{display:flex;align-items:center;gap:9px;margin-bottom:6px}
.tp-n{width:20px;height:20px;border-radius:6px;background:#eff6ff;color:var(--accent);font-size:7.5pt;font-weight:700;
display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid #dbeafe}
.tp-title{font-size:11pt;font-weight:700;color:#0f172a}
.tp-disc{font-size:9pt;color:#475569;line-height:1.6;margin:0 0 8px}
.tp-sub{margin-top:8px}
.tp-sub-h{font-family:'DM Mono',monospace;font-size:6.5pt;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px}
.dh-green{color:#16a34a}.dh-blue{color:var(--accent)}.dh-amber{color:#d97706}
ul.tp-list{list-style:none;margin:0;padding:0}
ul.tp-list li{padding:3px 0 3px 14px;position:relative;font-size:8.7pt;color:#334155;line-height:1.5}
ul.tp-list li::before{content:'';position:absolute;left:2px;top:9px;width:4px;height:4px;border-radius:50%;background:#cbd5e1}
.tp-owner{color:#94a3b8;font-size:8pt}

@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sec{break-inside:avoid}
  .card,.st,.tbl-wrap{break-inside:avoid}
}
</style></head><body>

<div class="wrap">
<!-- ═══ COVER ═══ -->
<div class="cover">
  <div class="brand">Garely · ${tr('report.pdfTitle')}</div>
  <h1>${esc(meeting.title)}</h1>
  <div class="cover-row">
    <div class="cmeta">
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      ${esc(dateStr)}
    </div>
    <div class="cmeta">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      ${esc(timeStr)}
    </div>
    <div class="cmeta">
      <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
      ${tr('report.participantsShort', { count: participants.length })}
    </div>
    <div class="cmeta">
      <svg viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="10"/></svg>
      ${tr('common.minutes', { count: dur })}
    </div>
    <div class="avatars">${avatarsHtml}</div>
  </div>
</div>

<!-- ═══ SUMMARY ═══ -->
${summaryPs ? `<div class="sec"><div class="sec-title">${tr('report.summary')}</div><div class="card">${summaryPs}</div></div>` : ''}

<!-- ═══ DETAILED (TOPICS) ═══ -->
${topicsHtml ? `<div class="sec"><div class="sec-title">${tr('report.tabDetailed')}</div>${topicsHtml}</div>` : ''}

<!-- ═══ DECISIONS ═══ -->
${decisionsHtml ? `<div class="sec"><div class="sec-title">${tr('report.decisions')}</div><div class="card">${decisionsHtml}</div></div>` : ''}

<!-- ═══ ACTION ITEMS ═══ -->
${itemsRows ? `<div class="sec"><div class="sec-title">${tr('report.actionItemsTitle')} <span style="font-family:'DM Sans';font-size:8pt;color:#94a3b8;font-weight:400;letter-spacing:0;text-transform:none;margin-left:4px">(${actionItems.length})</span></div><div class="tbl-wrap"><table><thead><tr><th style="width:42%">${tr('report.colTask')}</th><th>${tr('report.colAssignee')}</th><th>${tr('report.colPriority')}</th><th>${tr('report.colStatus')}</th></tr></thead><tbody>${itemsRows}</tbody></table></div></div>` : ''}

<!-- ═══ FOLLOW-UPS ═══ -->
${followUps ? `<div class="sec"><div class="sec-title">${tr('report.followUpsTitle')}</div><div class="card"><ul class="flu">${followUps}</ul></div></div>` : ''}

<!-- ═══ FOOTER ═══ -->
<div class="foot">
  <div class="foot-l">Garely</div>
  <div class="foot-r">${esc(typeof window !== 'undefined' ? window.location.host : '')} &middot; ${esc(new Date().toLocaleDateString(locale))}</div>
</div>

</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) { w.addEventListener('load', () => { setTimeout(() => { w.print(); URL.revokeObjectURL(url); }, 400); }); }
  }, [meeting, report, actionItems, analytics]);

  /* ─── Loading state ───────────────────────────────────────────── */

  if (loading) {
    return (
      <div className={css.loadingWrap}>
        <div className={css.spinner} />
        <span className={css.loadingText}>{tr('report.loading')}</span>
      </div>
    );
  }

  if (!meeting || !report) {
    return (
      <div className={css.centerWrap}>
        <div className={`card ${css.stateCard}`}>
          {reportStatus === 'generating' ? (
            <>
              <Loader2 size={40} className={css.stateSpinner} />
              <div className={css.stateTitle}>{tr('report.generatingTitle')}</div>
              <div className={css.stateDesc}>{tr('report.generatingDesc')}</div>
              <button className="btn" onClick={() => router.push('/')}>
                <ChevronLeft size={14} /> {tr('report.toDashboard')}
              </button>
            </>
          ) : reportStatus === 'failed' ? (
            <>
              <FileText size={40} className={css.stateIconDanger} style={{ color: 'var(--danger, #e5484d)' }} />
              <div className={css.stateTitle}>{tr('report.failedTitle')}</div>
              <div className={css.stateDesc}>{tr('report.failedDesc')}</div>
              <div className={css.stateActions}>
                {canRetryReport && (
                  <button className="btn btn-primary" onClick={retryReport}>
                    <Sparkles size={14} /> {tr('report.retry')}
                  </button>
                )}
                <button className="btn" onClick={() => router.push('/')}>
                  <ChevronLeft size={14} /> {tr('report.toDashboard')}
                </button>
              </div>
            </>
          ) : (
            <>
              <FileText size={40} className={css.stateIconMuted} />
              <div className={css.stateTitle}>{tr('report.notFoundTitle')}</div>
              <div className={css.stateDesc}>
                {tr('report.notFoundDesc')}
              </div>
              <button className="btn" onClick={() => router.push('/')}>
                <ChevronLeft size={14} /> {tr('report.toDashboard')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const scheduledDate = new Date(meeting.scheduledAt);
  const doneCount = actionItems.filter((a) => a.done).length;

  // Clickable transcript-timestamp chips for an extended-report item.
  const renderCites = (cites: number[]) =>
    cites && cites.length > 0 ? (
      <span className={css.cites}>
        {cites.slice(0, 10).map((ct, i) => (
          <button key={i} className="cite-chip" title={tr('report.jumpToTranscript')} onClick={() => jumpToTime(ct)}>
            {formatTimestamp(ct)}
          </button>
        ))}
      </span>
    ) : null;

  // Render an assistant chat message: turn [n] / [n, m] citations into clickable
  // timestamp chips (jump to that transcript moment); keep everything else as text.
  const renderChatText = (content: string) => {
    const segs = meeting?.transcripts || [];
    const out: React.ReactNode[] = [];
    let last = 0;
    let k = 0;
    // Match a citation ([n], [n, m], or ranges like [n-m]) OR a **bold** run;
    // render everything else as plain text.
    const re = /(\[[\d\s,.–—-]+\])|\*\*([^*\n]+)\*\*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m.index > last) out.push(<span key={`t${k++}`}>{content.slice(last, m.index)}</span>);
      if (m[1]) {
        const chips = m[1]
          .slice(1, -1)
          .split(',')
          .map((part) => {
            const d = part.match(/\d+/); // first line number (a range "80-81" jumps to 80)
            return d ? parseInt(d[0], 10) : NaN;
          })
          .filter((n) => Number.isFinite(n))
          .map((n) => segs[n - 1])
          .filter(Boolean)
          .slice(0, 8);
        if (chips.length === 0) {
          out.push(<span key={`t${k++}`}>{m[1]}</span>);
        } else {
          out.push(
            <span key={`c${k++}`} className={css.chatCites}>
              {chips.map((seg, j) => (
                <button key={j} className="cite-chip" title={tr('report.jumpToTranscript')} onClick={() => jumpToTime(seg.startTime)}>
                  {seg.timestamp}
                </button>
              ))}
            </span>
          );
        }
      } else {
        out.push(
          <strong key={`b${k++}`} className={css.chatBold}>
            {m[2]}
          </strong>
        );
      }
      last = m.index + m[0].length;
    }
    if (last < content.length) out.push(<span key={`t${k++}`}>{content.slice(last)}</span>);
    return out;
  };

  // One labelled block (decisions / tasks / open questions) inside a topic card.
  const renderSection = (
    label: string,
    color: string,
    icon: React.ReactNode,
    items: { text: string; meta?: string | null; cites: number[] }[]
  ) =>
    items.length > 0 ? (
      <div className={css.section}>
        <div className={css.sectionHead}>
          <span className={css.sectionIcon} style={{ color }}>{icon}</span>
          <span className={css.sectionLabel}>
            {label}
          </span>
        </div>
        <div className={css.sectionList}>
          {items.map((it, i) => (
            <div key={i} className={css.sectionItem}>
              <span className={css.sectionDot} style={{ background: color }} />
              <div className={css.sectionItemText}>
                {it.text}
                {it.meta ? <span className={css.metaMuted}> — {it.meta}</span> : null}
                {renderCites(it.cites)}
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null;

  /* ─── Render ──────────────────────────────────────────────────── */

  return (
    <div className={css.page}>
      {saveToast}
      <div className={css.container}>
        {/* ─── Header ─────────────────────────────────────────────── */}
        <div className={css.header}>
          <div className={css.headerTop}>
            <div className={css.headerLeft}>
              <button className="btn btn-ghost btn-icon" aria-label={tr('common.back')} onClick={() => router.back()}>
                <ChevronLeft size={16} />
              </button>
              <span
                className={`chip ${css.aiChip}`}
              >
                <Sparkles size={11} /> {tr('report.aiReportChip')}
              </span>
              <span className={css.headerMeta}>
                {fmtRelative(scheduledDate, locale, tz)} &bull; {fmtDateLong(scheduledDate, locale, tz)} &bull; {fmtTime(scheduledDate, tz)}
              </span>
            </div>
            <div className={css.headerActions}>
              <button className="btn btn-sm" onClick={copySummary}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? tr('report.copied') : tr('report.copySummary')}
              </button>
              <button className="btn btn-sm" onClick={downloadPdf}>
                <Download size={13} /> .pdf
              </button>
              <button className="btn btn-sm btn-primary" onClick={sendReport} disabled={sending}>
                {sending ? <Loader2 size={13} className={css.spinning} /> : <Send size={13} />} {tr('report.sendToTeam')}
              </button>
              <QuizManager
                meetingId={meetingId}
                participants={meeting.participants}
                reportReady={reportStatus === 'ready' || !!report}
                canManage={canRetryReport}
              />
              {sendMsg && (
                <span className={css.sendMsg} style={{ color: sendMsg.ok ? 'var(--green)' : 'var(--danger-fg)' }}>
                  {sendMsg.text}
                </span>
              )}
            </div>
          </div>
          <div className={css.titleRow}>
            <h1 className={css.title}>
              {meeting.title}
            </h1>
            <AvatarStack users={participantNames} max={5} size="sm" />
          </div>
        </div>

        {/* ─── Tabs ───────────────────────────────────────────────── */}
        <div className={css.tabs}>
          {[
            { key: 'summary' as const, label: tr('report.tabSummary'), icon: ListChecks },
            { key: 'detailed' as const, label: tr('report.tabDetailed'), icon: Sparkles },
            { key: 'transcript' as const, label: tr('report.tabTranscript'), icon: FileText },
            { key: 'chat' as const, label: tr('report.tabChat'), icon: MessageCircle },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={css.tab}
              style={{
                fontWeight: activeTab === tab.key ? 600 : 500,
                color: activeTab === tab.key ? 'var(--text)' : 'var(--muted)',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Summary Tab ────────────────────────────────────────── */}
        {activeTab === 'summary' && (
          <div className={`report-main-grid ${css.summaryGrid}`}>
            {/* Left column */}
            <div className={css.col}>
              {/* Підсумок */}
              <ReportCard icon={Sparkles} title={tr('report.summary')} accentColor="var(--accent)">
                <p className={css.summaryText}>
                  {report.summary}
                </p>
              </ReportCard>

              {/* Action Items */}
              <ReportCard
                icon={ListChecks}
                title={tr('report.actionItemsTitle')}
                accentColor="var(--amber)"
                badge={
                  <span
                    className={`chip ${css.countChip}`}
                    style={{
                      background: doneCount === actionItems.length
                        ? 'color-mix(in oklab, var(--green) 16%, transparent)'
                        : 'var(--surface-2)',
                      color: doneCount === actionItems.length ? 'var(--green)' : 'var(--text-2)',
                      borderColor: doneCount === actionItems.length
                        ? 'color-mix(in oklab, var(--green) 35%, transparent)'
                        : 'var(--border)',
                    }}
                  >
                    {doneCount}/{actionItems.length}
                  </span>
                }
              >
                <div className={css.list}>
                  {actionItems.map((item) => (
                    <div
                      key={item.id}
                      className={css.actionRow}
                      style={{
                        opacity: item.done ? 0.55 : 1,
                      }}
                    >
                      <button
                        onClick={() => toggleActionItem(item.id)}
                        disabled={item.clickupManaged || item.linearManaged}
                        className={css.checkbox}
                        style={{
                          border: item.done ? 'none' : item.status === 'in_progress' ? '2px solid var(--warn)' : '2px solid var(--border-2)',
                          background: item.done ? 'var(--green)' : 'transparent',
                          cursor: (item.clickupManaged || item.linearManaged) ? 'default' : 'pointer',
                        }}
                      >
                        {item.done
                          ? <Check size={12} className={css.onAccent} />
                          : item.status === 'in_progress'
                            ? <span className={css.progressDot} />
                            : null}
                      </button>
                      <div className={css.flex1}>
                        <div
                          className={css.itemText}
                          style={{
                            textDecoration: item.done ? 'line-through' : 'none',
                            color: item.done ? 'var(--muted)' : 'var(--text)',
                          }}
                        >
                          {item.text}
                        </div>
                        <div className={css.metaRow}>
                          <ReportAssigneeDropdown item={item} options={assignOptions.length ? assignOptions : users} onToggle={toggleAssignee} />
                          {item.dueDate && (
                            <span className={css.metaMono}>
                              {tr('report.due', { date: `${new Date(item.dueDate).getDate()}.${String(new Date(item.dueDate).getMonth() + 1).padStart(2, '0')}` })}
                            </span>
                          )}
                          <PriorityChip priority={item.priority} />
                          {(item.clickupManaged || item.linearManaged) && (
                            <a href={(item.linearManaged ? item.linearUrl : item.clickupUrl) || '#'} target="_blank" rel="noopener noreferrer" className={css.extLink}>
                              {item.linearManaged ? 'Linear ↗' : 'ClickUp ↗'}
                            </a>
                          )}
                        </div>
                      </div>
                      {/* A ClickUp-mirrored item IS deletable now (it removes the ClickUp
                          copies too — deleteActionItem confirms that separately). Linear
                          stays hidden: there is no delete path there, so the issue would
                          be orphaned. */}
                      {isAdmin && !item.linearManaged && (
                        <button
                          onClick={() => deleteActionItem(item.id, item.clickupManaged)}
                          title={tr('report.deleteActionItem')}
                          className={css.iconBtn}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in oklab, var(--red) 14%, transparent)'; e.currentTarget.style.color = '#fca5a5'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </ReportCard>

              {/* Decisions */}
              <ReportCard icon={CheckCircle} title={tr('report.decisions')} accentColor="var(--green)">
                <div className={css.list}>
                  {report.decisions.map((decision, i) => (
                    <div
                      key={i}
                      className={css.decisionRow}
                      style={{
                        borderBottom: i < report.decisions.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <span className={css.decNum}>
                        {i + 1}
                      </span>
                      <span className={css.decText}>{decision}</span>
                    </div>
                  ))}
                </div>
              </ReportCard>
            </div>

            {/* Right column */}
            <div className={css.col}>
              {/* Analytics */}
              <ReportCard icon={Users} title={tr('report.analytics')} accentColor="var(--purple)">
                {/* Stats grid */}
                <div className={css.statsGrid}>
                  {[
                    { label: tr('report.statDuration'), value: (analytics?.durationMin || 0) < 1 ? tr('report.durationUnderMin') : tr('common.minutes', { count: analytics?.durationMin || 0 }), icon: Clock, color: 'var(--accent)' },
                    { label: tr('report.statWords'), value: analytics?.wordsCount?.toLocaleString() || "0", icon: FileText, color: 'var(--green)' },
                    { label: tr('report.statReplies'), value: analytics?.repliesCount || 0, icon: Users, color: 'var(--amber)' },
                    { label: tr('report.statLanguages'), value: analytics?.languagesCount || 0, icon: Sparkles, color: 'var(--purple)' },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className={css.statCard}
                    >
                      <div className={css.statLabel}>
                        {stat.label}
                      </div>
                      <div className={css.statValue} style={{ color: stat.color }}>
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Language distribution bar */}
                <div className={css.blockGap}>
                  <div className={css.blockLabel}>
                    {tr('report.langDistribution')}
                  </div>
                  <div className={css.langBar}>
                    {(analytics?.languages || []).map((lang) => (
                      <div
                        key={lang.code}
                        className={css.langSeg}
                        style={{
                          width: `${lang.pct}%`,
                          background: lang.color,
                        }}
                      />
                    ))}
                  </div>
                  <div className={css.langLegend}>
                    {(analytics?.languages || []).map((lang) => (
                      <div key={lang.code} className={css.legendItem}>
                        <span
                          className={css.legendDot}
                          style={{
                            background: lang.color,
                          }}
                        />
                        <span className={css.legendLabel}>
                          {lang.label}
                        </span>
                        <span className={css.legendPct}>
                          {lang.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Speaker time bars */}
                <div>
                  <div className={css.blockLabelLg}>
                    {tr('report.speakerTime')}
                  </div>
                  <div className={css.stack8}>
                    {(analytics?.speakers || []).map((speaker) => (
                      <div key={speaker.name}>
                        <div className={css.speakerHead}>
                          <div className={css.rowCenter8}>
                            <Avatar name={speaker.name} image={speaker.image || null} size="sm" />
                            <span className={css.speakerName}>{speaker.name}</span>
                          </div>
                          <span className={css.speakerPct}>
                            {speaker.pct}%
                          </span>
                        </div>
                        <div className={css.speakerTrack}>
                          <div
                            className={css.speakerFill}
                            style={{
                              width: `${speaker.pct}%`,
                              background: getAvatarColor(speaker.name),
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ReportCard>

              {/* Follow-ups */}
              <ReportCard icon={ChevronRight} title={tr('report.followUpsTitle')} accentColor="var(--pink)">
                <div className={css.list}>
                  {report.followUps.map((item, i) => (
                    <div
                      key={i}
                      className={css.followRow}
                      style={{
                        borderBottom: i < report.followUps.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <ChevronRight
                        size={14}
                        className={css.followIcon}
                      />
                      <span className={css.followText}>{item}</span>
                    </div>
                  ))}
                </div>
              </ReportCard>

              {/* Recording — a failed or still-processing one now reaches this page
                  instead of being filtered out by the API, because a lost recording
                  the user cannot see is one they cannot act on. */}
              {recording && recording.status !== 'ready' && (
                <ReportCard icon={Video} title={tr('report.recording')} accentColor={recording.status === 'failed' ? 'var(--danger)' : 'var(--muted)'}>
                  <div
                    role={recording.status === 'failed' ? 'alert' : undefined}
                    className={css.recStatus}
                    style={{
                      background: recording.status === 'failed' ? 'var(--danger-bg)' : 'var(--bg-2)',
                      border: `1px solid ${recording.status === 'failed' ? 'color-mix(in oklab, var(--danger) 30%, transparent)' : 'var(--border)'}`,
                    }}
                  >
                    {recording.status === 'failed'
                      ? <AlertCircle size={16} className={css.recIconDanger} />
                      : <Clock size={16} className={css.recIconMuted} />}
                    <div className={css.recText} style={{ color: recording.status === 'failed' ? 'var(--danger-fg)' : 'var(--text-2)' }}>
                      {recording.status !== 'failed'
                        ? tr('report.recordingProcessing')
                        : recording.failureKind === 'no-audio'
                          ? tr('report.recordingNoAudio')
                          : tr('report.recordingFailed')}
                    </div>
                  </div>
                </ReportCard>
              )}
              {recording && recording.status === 'ready' && (
                <ReportCard icon={Video} title={tr('report.recording')} accentColor="var(--teal)">
                  <div className={css.recBox}>
                    <a
                      href={recording.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={tr('report.play')}
                      className={css.playBtn}
                    >
                      <Play size={18} className={css.playIcon} />
                    </a>
                    <div className={css.recInfo}>
                      <div className={css.recName}>{recording.fileName}</div>
                      {recording.salvaged === 'audio-only' && (
                        <div className={css.recMeta} style={{ color: 'var(--warn-fg)' }}>{tr('report.recordingSalvaged')}</div>
                      )}
                      <div className={css.recMeta}>
                        {recording.durationSec ? tr('common.minutes', { count: Math.floor(recording.durationSec / 60) }) : ''}
                        {recording.fileSize ? `${recording.durationSec ? ' • ' : ''}${(recording.fileSize / 1048576).toFixed(0)} MB` : ''}
                      </div>
                      <div className={css.recPerm} style={{ color: recording.permanent ? 'var(--green)' : 'var(--muted)' }}>
                        {recording.permanent ? (
                          <><Bookmark size={11} /> {tr('report.storedForever')}</>
                        ) : (
                          <><Clock size={11} /> {recording.expiresAt ? tr('report.willDeleteOn', { date: new Date(recording.expiresAt).toLocaleDateString(locale, { timeZone: tz }) }) : tr('report.temporary7Days')}</>
                        )}
                      </div>
                    </div>
                    <div className={css.recActions}>
                      <a className="btn btn-ghost btn-icon" href={recording.url} download={recording.fileName} title={tr('report.download')}>
                        <Download size={15} />
                      </a>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={toggleRecordingPermanent}
                        disabled={recBusy}
                        title={recording.permanent ? tr('report.revert7Day') : tr('report.storeForever')}
                        style={{ color: recording.permanent ? 'var(--green)' : 'var(--muted)' }}
                      >
                        {recBusy ? <Loader2 size={15} className={css.spinning} /> : recording.permanent ? <Clock size={15} /> : <Bookmark size={15} />}
                      </button>
                      <button
                        className={`btn btn-ghost btn-icon ${css.dangerBtn}`}
                        onClick={deleteRecording}
                        disabled={recBusy}
                        title={tr('report.deleteRecording')}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </ReportCard>
              )}
            </div>
          </div>
        )}

        {/* ─── Detailed (Extended) Report Tab ─────────────────────── */}
        {activeTab === 'detailed' && (
          <div>
            {report.topics && report.topics.length > 0 ? (
              <div className={css.stack16}>
                {report.topics.map((topic, ti) => (
                  <div key={ti} className={`card fade-in ${css.topicCard}`}>
                    <div className={css.topicRow}>
                      <span className={css.topicNum}>
                        {ti + 1}
                      </span>
                      <div className={css.flex1}>
                        <div className={css.topicTitle}>{topic.title}</div>
                        {topic.discussion ? (
                          <div className={css.topicDisc}>
                            {topic.discussion}
                          </div>
                        ) : null}
                        {renderSection(
                          tr('report.decisions'),
                          'var(--green)',
                          <CheckCircle size={14} />,
                          topic.decisions.map((d) => ({ text: d.text, meta: d.owner, cites: d.cites }))
                        )}
                        {renderSection(
                          tr('report.detailTasks'),
                          'var(--accent)',
                          <ListChecks size={14} />,
                          topic.tasks.map((k) => ({ text: k.title, meta: k.assignee, cites: k.cites }))
                        )}
                        {renderSection(
                          tr('report.openQuestions'),
                          'var(--amber)',
                          <HelpCircle size={14} />,
                          topic.openQuestions.map((q) => ({ text: q.text, meta: null, cites: q.cites }))
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`card ${css.emptyCard}`}>
                <Sparkles size={28} className={css.emptyIcon} />
                <div className={css.emptyTitle}>{tr('report.noExtended')}</div>
                <div className={css.emptyDesc}>{tr('report.noExtendedDesc')}</div>
              </div>
            )}
          </div>
        )}

        {/* ─── Transcript Tab ─────────────────────────────────────── */}
        {activeTab === 'transcript' && (
          <div>
            {canFixLanguage && tracks.length > 0 && (
              <div className={css.fixPanel}>
                <div className={css.fixHead}>
                  <Languages size={15} className={css.accentIcon} />
                  <span className={css.fixTitle}>
                    {tr('report.fixLangTitle')}
                  </span>
                </div>
                <p className={css.fixDesc}>
                  {tr('report.fixLangDesc')}
                </p>
                <div className={css.stack8}>
                  {tracks.map((t) => {
                    const sel = trackLangSel[t.id] ?? (t.detectedLanguage || '');
                    const busy = fixingId === t.id;
                    return (
                      <div
                        key={t.id}
                        className={css.trackRow}
                      >
                        <span className={css.trackName}>
                          {t.speakerName || t.participantIdentity}
                        </span>
                        <Select
                          value={sel}
                          disabled={busy}
                          onChange={(v) => setTrackLangSel((p) => ({ ...p, [t.id]: v }))}
                          style={{ width: 'auto', minWidth: 130, padding: '6px 10px' }}
                          options={[
                            { value: '', label: '—' },
                            { value: 'uk', label: tr('report.langUk') },
                            { value: 'en', label: tr('report.langEn') },
                            { value: 'ru', label: tr('report.langRu') },
                          ]}
                        />
                        <button
                          className="btn btn-sm"
                          disabled={busy || !sel}
                          onClick={() => runFixLanguage(t.id)}
                        >
                          {busy ? <Loader2 size={13} className={css.spinning} /> : <Languages size={13} />}
                          {busy ? tr('report.fixLangBusy') : tr('report.fixLangAction')}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {fixMsg && (
                  <div
                    className={css.fixMsg}
                    style={{
                      color: fixMsg.ok ? 'var(--success, #22c55e)' : 'var(--danger, var(--danger))',
                    }}
                  >
                    {fixMsg.text}
                  </div>
                )}
              </div>
            )}
            {/* Toolbar */}
            <div className={css.toolbar}>
              <div className={css.searchWrap}>
                <Search
                  size={14}
                  className={css.searchIcon}
                />
                <input
                  className={`field ${css.searchInput}`}
                  placeholder={tr('report.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingRight: searchQuery ? 68 : 12 }}
                />
                {searchQuery && (
                  <div className={css.searchTools}>
                    <span className={css.searchCount}>
                      {tr('report.transcriptCount', { shown: filteredTranscripts.length, total: meeting.transcripts.length })}
                    </span>
                    <button
                      onClick={() => setSearchQuery('')}
                      className={css.clearBtn}
                    >
                      <X size={10} className={css.clearIcon} />
                    </button>
                  </div>
                )}
              </div>
              <button className="btn btn-sm" onClick={copyAllTranscript}>
                {copiedTranscript ? <Check size={13} /> : <Copy size={13} />}
                {copiedTranscript ? tr('report.copied') : tr('report.copyAll')}
              </button>
            </div>

            {/* Transcript list */}
            <div className={css.segList}>
              {filteredTranscripts.map((segment, idx) => {
                const langClass = `lang-${segment.language}`;
                const langLabel = segment.language.toUpperCase();
                return (
                  <div
                    key={segment.id}
                    id={`seg-${idx}`}
                    className={`fade-in ${css.segRow}`}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    <Avatar name={segment.speakerName} image={segment.speakerImage || null} size="md" />
                    <div className={css.flex1}>
                      <div className={css.segHead}>
                        <span className={css.segName}>{segment.speakerName}</span>
                        <span className={`lang-badge ${langClass}`}>{langLabel}</span>
                        <span className={css.metaMono}>
                          {segment.timestamp}
                        </span>
                      </div>
                      <div className={css.segText}>
                        <HighlightText text={segment.text} query={searchQuery} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredTranscripts.length === 0 && searchQuery && (
                <div className={css.noResults}>
                  <Search size={28} className={css.noResultsIcon} />
                  <div className={css.noResultsTitle}>{tr('report.nothingFound')}</div>
                  <div className={css.emptyDesc}>
                    {tr('report.tryAnotherSearch')}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Chat Tab ───────────────────────────────────────────── */}
        {activeTab === 'chat' && (
          <div className={css.chatWrap}>
            {/* Ambient glow from the top */}
            <div
              aria-hidden
              className={css.chatGlow}
            />

            {/* Messages */}
            <div
              ref={chatScrollRef}
              className={css.chatScroll}
            >
              {chatMessages.length === 0 ? (
                <div className={css.chatEmpty}>
                  <div className={`chat-orb fade-in ${css.chatOrb}`}>
                    <Sparkles size={26} />
                  </div>
                  <div className={css.chatTitle}>{tr('report.chatTitle')}</div>
                  <div className={css.chatIntro}>
                    {tr('report.chatIntro')}
                  </div>
                  <div className={css.chatSuggests}>
                    {[
                      { t: tr('report.chatSuggest1'), icon: <Sparkles size={15} /> },
                      { t: tr('report.chatSuggest2'), icon: <CheckCircle size={15} /> },
                      { t: tr('report.chatSuggest3'), icon: <ListChecks size={15} /> },
                      { t: tr('report.chatSuggest4'), icon: <HelpCircle size={15} /> },
                    ].map((s, i) => (
                      <button
                        key={i}
                        className="chat-suggest fade-in"
                        style={{ animationDelay: `${i * 60}ms` }}
                        disabled={chatBusy}
                        onClick={() => sendChat(s.t)}
                      >
                        <span className="cs-ico">{s.icon}</span>
                        <span className={css.suggestText}>{s.t}</span>
                        <ChevronRight size={15} className="cs-arrow" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={css.chatList}>
                  {chatMessages.map((msg, i) => {
                  const isUser = msg.role === 'user';
                  const streaming = chatBusy && !isUser && i === chatMessages.length - 1 && !msg.content;
                  return (
                    <div
                      key={i}
                      className={`${isUser ? 'chat-bubble-user' : 'chat-bubble-ai'} ${css.bubbleRow}`}
                      style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}
                    >
                      {isUser ? (
                        <Avatar name={session?.user?.name || 'U'} image={session?.user?.image || null} size="sm" />
                      ) : (
                        <div className={css.aiAvatar}>
                          <Sparkles size={15} />
                        </div>
                      )}
                      <div
                        className={css.bubble}
                        style={{
                          borderTopRightRadius: isUser ? 5 : 16,
                          borderTopLeftRadius: isUser ? 16 : 5,
                          background: isUser ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'var(--surface)',
                          border: `1px solid ${isUser ? 'color-mix(in oklab, var(--accent) 34%, transparent)' : 'var(--border)'}`,
                          color: isUser ? 'var(--text)' : 'var(--text-2)',
                          boxShadow: isUser ? 'none' : '0 1px 0 rgba(255,255,255,.02) inset',
                        }}
                      >
                        {streaming ? (
                          <span className="chat-typing" aria-label={tr('report.chatThinking')}>
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : isUser ? (
                          msg.content
                        ) : (
                          renderChatText(msg.content)
                        )}
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>

            {/* Composer */}
            <div className={css.composerWrap}>
              <div className={css.composerInner}>
                <div className="chat-composer">
                <textarea
                  ref={chatTaRef}
                  rows={1}
                  placeholder={tr('report.chatPlaceholder')}
                  value={chatInput}
                  disabled={chatBusy}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button
                  className="chat-send"
                  onClick={() => sendChat()}
                  disabled={chatBusy || !chatInput.trim()}
                  title={tr('report.chatSend')}
                >
                  {chatBusy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                </button>
              </div>
              <div className={css.composerFoot}>
                <span className={css.disclaimer}>{tr('report.chatDisclaimer')}</span>
                {chatMessages.length > 0 && (
                  <button onClick={clearChat} className={`btn btn-ghost btn-sm ${css.clearChatBtn}`}>
                    <Trash2 size={12} /> {tr('report.chatClear')}
                  </button>
                )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}