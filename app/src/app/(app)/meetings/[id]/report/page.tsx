'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import {
  ChevronLeft, Sparkles, Copy, Send, FileText, Check, Clock,
  Users, Search, X, ChevronRight, Video, Play, ListChecks,
  CheckCircle, Download, ChevronDown, User, Loader2, Trash2, Bookmark,
} from 'lucide-react';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { fmtTime, fmtRelative, fmtDateLong, getInitials, getAvatarColor } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────────── */

interface Participant {
  id: string;
  user: { id: string; name: string; image: string | null } | null;
  guestName: string | null;
}

interface TranscriptSegment {
  id: string;
  speakerName: string;
  speakerImage?: string | null;
  language: 'ua' | 'en' | 'ru';
  timestamp: string;
  text: string;
}

interface ActionItem {
  id: string;
  text: string;
  assignee: string;
  assigneeImage?: string | null;
  dueDate: string | null;
  priority: 'high' | 'medium' | 'low';
  done: boolean;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface Report {
  id: string;
  summary: string;
  actionItems: ActionItem[];
  decisions: string[];
  followUps: string[];
  analytics: {
    durationMin: number;
    wordsCount: number;
    repliesCount: number;
    languagesCount: number;
    languages: { label: string; code: string; pct: number; color: string }[];
    speakers: { name: string; image?: string | null; pct: number }[];
  };
  recording?: {
    fileName: string;
    fileSize: string;
    duration: string;
  } | null;
}

interface Meeting {
  id: string;
  title: string;
  scheduledAt: string;
  createdAt: string;
  endedAt: string | null;
  durationMin: number;
  status: string;
  participants: Participant[];
  transcripts: TranscriptSegment[];
  reports: Report[];
}

/* ─── Transform API data to page interfaces ─────────────────────── */
function transformApiData(data: any): Meeting {
  // Transform transcripts: content -> text, startTime -> timestamp
  const transcripts = (data.transcripts || []).map((t: any) => ({
    id: t.id,
    speakerName: t.speakerName || t.speaker?.name || 'Unknown',
    speakerImage: t.speaker?.image || null,
    language: (t.language || 'uk').toLowerCase().replace('uk', 'ua') as 'ua' | 'en' | 'ru',
    timestamp: formatTimestamp(t.startTime || 0),
    text: t.content || t.text || '',
  }));

  // Transform reports
  const reports = (data.reports || []).map((r: any) => {
    // Tasks come as r.tasks from the API (Prisma relation), map to actionItems
    const actionItems = (r.tasks || r.actionItems || []).map((t: any) => ({
      id: t.id,
      text: t.title || t.text || '',
      assignee: t.assigneeName || t.assignee?.name || t.assignee || '',
      assigneeImage: t.assignee?.image || null,
      dueDate: t.dueDate || null,
      priority: (t.priority || 'medium') as 'high' | 'medium' | 'low',
      done: t.status === 'done' || t.done || false,
    }));

    return {
      id: r.id,
      summary: r.summary || '',
      actionItems,
      decisions: Array.isArray(r.decisions) ? r.decisions : [],
      followUps: Array.isArray(r.followUps) ? r.followUps : [],
      analytics: r.analytics || null,
      recording: r.recording || null,
    };
  });

  // Compute actual durationMin from real meeting time
  let durationMin = 0;
  const meetStart = data.scheduledAt || data.createdAt;
  if (meetStart && data.endedAt) {
    durationMin = Math.round((new Date(data.endedAt).getTime() - new Date(meetStart).getTime()) / 60000);
  }
  if (!durationMin) durationMin = data.durationMin || 0;

  return {
    id: data.id,
    title: data.title || 'Мітинг',
    scheduledAt: data.scheduledAt,
    createdAt: data.createdAt,
    endedAt: data.endedAt,
    durationMin,
    status: data.status,
    participants: data.participants || [],
    transcripts,
    reports,
  };
}

function formatTimestamp(seconds: number): string {
  const totalSec = Math.floor(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}


/* ─── AssigneeDropdown (report) ─────────────────────────────────── */

function ReportAssigneeDropdown({
  item,
  users,
  onAssign,
}: {
  item: { id: string; assignee: string; assigneeImage?: string | null };
  users: UserItem[];
  onAssign: (itemId: string, userId: string, user: UserItem) => void;
}) {
  const tr = useTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; bottom: number; openUp: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && panelRef.current && !panelRef.current.contains(t)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            const openUp = window.innerHeight - r.bottom < 290;
            setPos({ left: r.left, top: r.bottom, bottom: window.innerHeight - r.top, openUp });
          }
          setOpen(!open);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 6px',
          borderRadius: 6,
          transition: 'background 0.15s',
          fontSize: 11.5,
          color: 'var(--text-2)',
        }}
        onMouseEnter={(e: any) => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={(e: any) => (e.currentTarget.style.background = 'transparent')}
      >
        <Avatar name={item.assignee || 'U'} image={item.assigneeImage || null} size="sm" />
        <span>{item.assignee || tr('report.unassigned')}</span>
        <ChevronDown size={10} style={{ opacity: 0.5 }} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            left: pos?.left ?? 0,
            ...(pos?.openUp
              ? { bottom: (pos?.bottom ?? 0) + 4 }
              : { top: (pos?.top ?? 0) + 4 }),
            zIndex: 1000,
            minWidth: 220,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            padding: 4,
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {users.map((u) => (
            <button
              key={u.id}
              onClick={(e) => {
                e.stopPropagation();
                onAssign(item.id, u.id, u);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                borderRadius: 7,
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--text)',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e: any) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e: any) => (e.currentTarget.style.background = 'transparent')}
            >
              <Avatar name={u.name} image={u.image} size="sm" />
              <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
              </div>
            </button>
          ))}
          {users.length === 0 && (
            <div style={{ padding: '12px 10px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              {tr('report.noUsers')}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── PriorityChip ──────────────────────────────────────────────── */

const PRIORITY_MAP: Record<string, { color: string; labelKey: string }> = {
  high: { color: 'var(--red)', labelKey: 'report.priorityHigh' },
  medium: { color: 'var(--amber)', labelKey: 'report.priorityMedium' },
  low: { color: 'var(--muted)', labelKey: 'report.priorityLow' },
};

function PriorityChip({ priority }: { priority: string }) {
  const tr = useTranslations();
  const p = PRIORITY_MAP[priority] || PRIORITY_MAP.low;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.02em',
        color: p.color,
        background: `color-mix(in oklab, ${p.color} 14%, transparent)`,
        border: `1px solid color-mix(in oklab, ${p.color} 30%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {tr(p.labelKey)}
    </span>
  );
}

/* ─── ReportCard ────────────────────────────────────────────────── */

function ReportCard({
  icon: Icon,
  title,
  accentColor,
  badge,
  actions,
  children,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  accentColor: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: `color-mix(in oklab, ${accentColor} 16%, transparent)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={15} style={{ color: accentColor }} />
          </div>
          <span style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap' }}>{title}</span>
          {badge}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{actions}</div>}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

/* ─── Highlight helper ──────────────────────────────────────────── */

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            style={{
              background: 'color-mix(in oklab, var(--amber) 40%, transparent)',
              color: 'var(--text)',
              borderRadius: 3,
              padding: '1px 2px',
            }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/* ─── Main page component ───────────────────────────────────────── */

export default function MeetingReportPage() {
  const tr = useTranslations();
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'admin';

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript'>('summary');
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [recording, setRecording] = useState<any>(null);
  const [recBusy, setRecBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const reassignTask = useCallback(async (itemId: string, userId: string, user: UserItem) => {
    setActionItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, assignee: user.name, assigneeImage: user.image }
          : item
      )
    );
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: itemId, assigneeId: userId }),
      });
    } catch (e) { console.error(e); }
  }, []);

  const report = meeting?.reports?.[0] ?? null;

  const toggleActionItem = useCallback((id: string) => {
    setActionItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  }, []);

  const deleteActionItem = useCallback(async (id: string) => {
    if (!window.confirm(tr('report.deleteActionItemConfirm'))) return;
    setActionItems((prev) => prev.filter((item) => item.id !== id));
    try {
      await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: id }),
      });
    } catch (e) { console.error(e); }
  }, []);

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

    // Duration: prefer actual time (endedAt - scheduledAt/createdAt), fallback to transcript range, then planned durationMin
    let durationMin = 0;
    const startTime = meeting.scheduledAt || meeting.createdAt;
    if (startTime && meeting.endedAt) {
      const diffMs = new Date(meeting.endedAt).getTime() - new Date(startTime).getTime();
      durationMin = Math.round(diffMs / 60000);
    }
    if (!durationMin && transcripts.length >= 2) {
      // Fallback: use transcript timestamps range
      const times = transcripts.map((t: any) => parseFloat(t.timestamp) || 0).filter((t: number) => t > 0);
      if (times.length >= 2) {
        durationMin = Math.round((Math.max(...times) - Math.min(...times)) / 60);
      }
    }
    if (!durationMin) durationMin = meeting.durationMin || 0;

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
    const langColors: Record<string, string> = { ua: '#f59e0b', en: '#10b981', ru: '#a78bfa', pt: '#f472b6', hi: '#fb923c' };
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
      languages: languages.length > 0 ? languages : [{ label: tr('report.langUk'), code: 'UA', pct: 100, color: '#f59e0b' }],
      speakers,
    };
  }, [meeting]);

  const downloadPdf = useCallback(() => {
    if (!meeting || !report) return;

    const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const participants = meeting.participants.map(p => p.user?.name || p.guestName || 'Guest');

    const dateStr = meeting.scheduledAt
      ? new Date(meeting.scheduledAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const timeStr = meeting.scheduledAt
      ? new Date(meeting.scheduledAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
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
background:linear-gradient(90deg,#3b82f6 0%,#3b82f6 30%,#e2e8f0 30%,#e2e8f0 100%)}
.brand{font-family:'DM Mono',monospace;font-size:7pt;font-weight:500;color:#94a3b8;
text-transform:uppercase;letter-spacing:0.18em;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.brand::before{content:'';display:inline-block;width:8px;height:8px;background:#3b82f6;border-radius:2px}
.cover h1{font-size:22pt;font-weight:700;color:#0f172a;letter-spacing:-0.03em;line-height:1.15;margin-bottom:12px}
.cover-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.cmeta{font-family:'DM Mono',monospace;font-size:7.5pt;color:#64748b;display:flex;align-items:center;gap:5px}
.cmeta svg{width:12px;height:12px;stroke:#94a3b8;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.avatars{display:flex;margin-left:auto}
.pav{width:26px;height:26px;border-radius:50%;font-size:7pt;font-weight:600;
color:#fff;display:inline-flex;align-items:center;justify-content:center;
margin-left:-6px;border:2px solid #fff;position:relative}
.pav:nth-child(6n+1){background:#3b82f6}
.pav:nth-child(6n+2){background:#8b5cf6}
.pav:nth-child(6n+3){background:#06b6d4}
.pav:nth-child(6n+4){background:#f59e0b}
.pav:nth-child(6n+5){background:#10b981}
.pav:nth-child(6n+6){background:#ef4444}
.pav:first-child{margin-left:0}

/* ─ Section ─ */
.sec{margin-bottom:20px;break-inside:avoid}
.sec-title{font-family:'DM Mono',monospace;font-size:7pt;font-weight:500;color:#3b82f6;
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
.dec-n{width:22px;height:22px;border-radius:6px;background:#eff6ff;color:#3b82f6;
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
ul.flu li::before{content:'';position:absolute;left:0;top:14px;width:5px;height:5px;border-radius:50%;background:#3b82f6}

/* ─ Speakers ─ */
.spk{display:flex;align-items:center;gap:8px;padding:4px 0}
.spk-name{width:110px;font-size:8.5pt;color:#64748b;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spk-track{flex:1;height:5px;background:#f1f5f9;border-radius:3px;overflow:hidden}
.spk-fill{height:100%;background:linear-gradient(90deg,#3b82f6,#60a5fa);border-radius:3px}
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
.tr-lang{font-family:'DM Mono',monospace;font-size:6pt;color:#3b82f6;background:#eff6ff;padding:1px 4px;border-radius:3px;font-weight:500}
.tr-txt{font-size:8.5pt;color:#64748b;line-height:1.55}

/* ─ Footer ─ */
.foot{margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center}
.foot-l{font-family:'DM Mono',monospace;font-size:7pt;color:#94a3b8;display:flex;align-items:center;gap:6px}
.foot-l::before{content:'';display:inline-block;width:6px;height:6px;background:#3b82f6;border-radius:1.5px}
.foot-r{font-family:'DM Mono',monospace;font-size:6.5pt;color:#cbd5e1;letter-spacing:0.03em}

/* ─ Two-col layout for analytics ─ */
.row2{display:flex;gap:12px}
.row2>.col{flex:1;min-width:0}

/* ─ Subtle label inside card ─ */
.card-label{font-family:'DM Mono',monospace;font-size:6.5pt;font-weight:500;color:#94a3b8;
text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px}

@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sec{break-inside:avoid}
  .card,.st,.tbl-wrap{break-inside:avoid}
}
</style></head><body>

<div class="wrap">
<!-- ═══ COVER ═══ -->
<div class="cover">
  <div class="brand">EZmeet · ${tr('report.pdfTitle')}</div>
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

<!-- ═══ DECISIONS ═══ -->
${decisionsHtml ? `<div class="sec"><div class="sec-title">${tr('report.decisions')}</div><div class="card">${decisionsHtml}</div></div>` : ''}

<!-- ═══ ACTION ITEMS ═══ -->
${itemsRows ? `<div class="sec"><div class="sec-title">Action Items <span style="font-family:'DM Sans';font-size:8pt;color:#94a3b8;font-weight:400;letter-spacing:0;text-transform:none;margin-left:4px">(${actionItems.length})</span></div><div class="tbl-wrap"><table><thead><tr><th style="width:42%">${tr('report.colTask')}</th><th>${tr('report.colAssignee')}</th><th>${tr('report.colPriority')}</th><th>${tr('report.colStatus')}</th></tr></thead><tbody>${itemsRows}</tbody></table></div></div>` : ''}

<!-- ═══ FOLLOW-UPS ═══ -->
${followUps ? `<div class="sec"><div class="sec-title">Follow-ups</div><div class="card"><ul class="flu">${followUps}</ul></div></div>` : ''}

<!-- ═══ FOOTER ═══ -->
<div class="foot">
  <div class="foot-l">EZmeet</div>
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
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>{tr('report.loading')}</span>
      </div>
    );
  }

  if (!meeting || !report) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ textAlign: 'center', padding: '48px 40px', maxWidth: 420 }}>
          <FileText size={40} style={{ color: 'var(--muted)', marginBottom: 14, opacity: 0.5 }} />
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{tr('report.notFoundTitle')}</div>
          <div style={{ color: 'var(--muted)', marginBottom: 20, fontSize: 13.5 }}>
            {tr('report.notFoundDesc')}
          </div>
          <button className="btn" onClick={() => router.push('/')}>
            <ChevronLeft size={14} /> {tr('report.toDashboard')}
          </button>
        </div>
      </div>
    );
  }

  const scheduledDate = new Date(meeting.scheduledAt);
  const doneCount = actionItems.filter((a) => a.done).length;

  /* ─── Render ──────────────────────────────────────────────────── */

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px clamp(14px, 4vw, 28px) 80px' }}>
        {/* ─── Header ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <button className="btn btn-ghost btn-icon" onClick={() => router.back()}>
                <ChevronLeft size={16} />
              </button>
              <span
                className="chip"
                style={{
                  background: 'color-mix(in oklab, var(--accent) 18%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--accent) 40%, transparent)',
                  color: '#bfdbfe',
                }}
              >
                <Sparkles size={11} /> AI Report
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                {fmtRelative(scheduledDate, locale)} &bull; {fmtDateLong(scheduledDate, locale)} &bull; {fmtTime(scheduledDate)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={copySummary}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? tr('report.copied') : tr('report.copySummary')}
              </button>
              <button className="btn btn-sm" onClick={downloadPdf}>
                <Download size={13} /> .pdf
              </button>
              <button className="btn btn-sm btn-primary" onClick={sendReport} disabled={sending}>
                {sending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />} {tr('report.sendToTeam')}
              </button>
              {sendMsg && (
                <span style={{ fontSize: 12, color: sendMsg.ok ? 'var(--green)' : '#f87171', display: 'inline-flex', alignItems: 'center' }}>
                  {sendMsg.text}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', flex: 1, minWidth: 0 }}>
              {meeting.title}
            </h1>
            <AvatarStack users={participantNames} max={5} size="sm" />
          </div>
        </div>

        {/* ─── Tabs ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {[
            { key: 'summary' as const, label: tr('report.tabSummary'), icon: ListChecks },
            { key: 'transcript' as const, label: tr('report.tabTranscript'), icon: FileText },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 16px',
                fontSize: 13.5,
                fontWeight: activeTab === tab.key ? 600 : 500,
                color: activeTab === tab.key ? 'var(--text)' : 'var(--muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginBottom: -1,
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Summary Tab ────────────────────────────────────────── */}
        {activeTab === 'summary' && (
          <div className="report-main-grid" style={{ display: 'grid', gap: 18, alignItems: 'start' }}>
            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Підсумок */}
              <ReportCard icon={Sparkles} title={tr('report.summary')} accentColor="var(--accent)">
                <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.7 }}>
                  {report.summary}
                </p>
              </ReportCard>

              {/* Action Items */}
              <ReportCard
                icon={ListChecks}
                title="Action Items"
                accentColor="var(--amber)"
                badge={
                  <span
                    className="chip"
                    style={{
                      fontSize: 10.5,
                      padding: '2px 7px',
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {actionItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '12px 0',
                        borderBottom: '1px solid var(--border)',
                        opacity: item.done ? 0.55 : 1,
                        transition: 'opacity 0.2s',
                      }}
                    >
                      <button
                        onClick={() => toggleActionItem(item.id)}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          border: item.done ? 'none' : '2px solid var(--border-2)',
                          background: item.done ? 'var(--green)' : 'transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        {item.done && <Check size={12} style={{ color: '#fff' }} />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13.5,
                            fontWeight: 500,
                            lineHeight: 1.5,
                            textDecoration: item.done ? 'line-through' : 'none',
                            color: item.done ? 'var(--muted)' : 'var(--text)',
                            marginBottom: 6,
                          }}
                        >
                          {item.text}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <ReportAssigneeDropdown item={item} users={users} onAssign={reassignTask} />
                          {item.dueDate && (
                            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                              {tr('report.due', { date: `${new Date(item.dueDate).getDate()}.${String(new Date(item.dueDate).getMonth() + 1).padStart(2, '0')}` })}
                            </span>
                          )}
                          <PriorityChip priority={item.priority} />
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => deleteActionItem(item.id)}
                          title={tr('report.deleteActionItem')}
                          style={{
                            width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 1,
                            border: '1px solid transparent', background: 'transparent',
                            color: 'var(--muted)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all .15s',
                          }}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {report.decisions.map((decision, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '11px 0',
                        borderBottom: i < report.decisions.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 7,
                          background: 'color-mix(in oklab, var(--green) 14%, transparent)',
                          color: 'var(--green)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: 'var(--mono)',
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{decision}</span>
                    </div>
                  ))}
                </div>
              </ReportCard>
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Analytics */}
              <ReportCard icon={Users} title={tr('report.analytics')} accentColor="var(--purple)">
                {/* Stats grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    marginBottom: 18,
                  }}
                >
                  {[
                    { label: tr('report.statDuration'), value: (analytics?.durationMin || 0) < 1 ? tr('report.durationUnderMin') : tr('common.minutes', { count: analytics?.durationMin || 0 }), icon: Clock, color: 'var(--accent)' },
                    { label: tr('report.statWords'), value: analytics?.wordsCount?.toLocaleString() || "0", icon: FileText, color: 'var(--green)' },
                    { label: tr('report.statReplies'), value: analytics?.repliesCount || 0, icon: Users, color: 'var(--amber)' },
                    { label: tr('report.statLanguages'), value: analytics?.languagesCount || 0, icon: Sparkles, color: 'var(--purple)' },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      style={{
                        padding: '12px 14px',
                        background: 'var(--bg-2)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                        {stat.label}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: stat.color, letterSpacing: '-0.02em' }}>
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Language distribution bar */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, fontWeight: 500 }}>
                    {tr('report.langDistribution')}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      height: 8,
                      borderRadius: 999,
                      overflow: 'hidden',
                      background: 'var(--bg-2)',
                      marginBottom: 8,
                    }}
                  >
                    {(analytics?.languages || []).map((lang) => (
                      <div
                        key={lang.code}
                        style={{
                          width: `${lang.pct}%`,
                          background: lang.color,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {(analytics?.languages || []).map((lang) => (
                      <div key={lang.code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: lang.color,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                          {lang.label}
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                          {lang.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Speaker time bars */}
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10, fontWeight: 500 }}>
                    {tr('report.speakerTime')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(analytics?.speakers || []).map((speaker) => (
                      <div key={speaker.name}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={speaker.name} image={speaker.image || null} size="sm" />
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{speaker.name}</span>
                          </div>
                          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', fontWeight: 600 }}>
                            {speaker.pct}%
                          </span>
                        </div>
                        <div
                          style={{
                            height: 5,
                            background: 'var(--bg-2)',
                            borderRadius: 999,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${speaker.pct}%`,
                              background: getAvatarColor(speaker.name),
                              borderRadius: 999,
                              transition: 'width 0.5s ease',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ReportCard>

              {/* Follow-ups */}
              <ReportCard icon={ChevronRight} title="Follow-ups" accentColor="var(--pink)">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {report.followUps.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 0',
                        borderBottom: i < report.followUps.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <ChevronRight
                        size={14}
                        style={{ color: 'var(--pink)', flexShrink: 0, marginTop: 3 }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </ReportCard>

              {/* Recording */}
              {recording && (
                <ReportCard icon={Video} title={tr('report.recording')} accentColor="var(--teal)">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '12px 16px',
                      background: 'var(--bg-2)',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <a
                      href={recording.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={tr('report.play')}
                      style={{
                        width: 42, height: 42, borderRadius: 10,
                        background: 'color-mix(in oklab, var(--teal) 16%, transparent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, cursor: 'pointer', textDecoration: 'none',
                      }}
                    >
                      <Play size={18} style={{ color: 'var(--teal)', marginLeft: 2 }} />
                    </a>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recording.fileName}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                        {recording.durationSec ? tr('common.minutes', { count: Math.floor(recording.durationSec / 60) }) : ''}
                        {recording.fileSize ? `${recording.durationSec ? ' • ' : ''}${(recording.fileSize / 1048576).toFixed(0)} MB` : ''}
                      </div>
                      <div style={{ fontSize: 10.5, marginTop: 4, color: recording.permanent ? 'var(--green)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {recording.permanent ? (
                          <><Bookmark size={11} /> {tr('report.storedForever')}</>
                        ) : (
                          <><Clock size={11} /> {recording.expiresAt ? tr('report.willDeleteOn', { date: new Date(recording.expiresAt).toLocaleDateString(locale) }) : tr('report.temporary7Days')}</>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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
                        {recBusy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : recording.permanent ? <Clock size={15} /> : <Bookmark size={15} />}
                      </button>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={deleteRecording}
                        disabled={recBusy}
                        title={tr('report.deleteRecording')}
                        style={{ color: 'var(--red)' }}
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

        {/* ─── Transcript Tab ─────────────────────────────────────── */}
        {activeTab === 'transcript' && (
          <div>
            {/* Toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  className="field"
                  placeholder={tr('report.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 34, paddingRight: searchQuery ? 68 : 12 }}
                />
                {searchQuery && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                      {tr('report.transcriptCount', { shown: filteredTranscripts.length, total: meeting.transcripts.length })}
                    </span>
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'var(--surface-3)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <X size={10} style={{ color: 'var(--text-2)' }} />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredTranscripts.map((segment) => {
                const langClass = `lang-${segment.language}`;
                const langLabel = segment.language.toUpperCase();
                return (
                  <div
                    key={segment.id}
                    className="fade-in"
                    style={{
                      display: 'flex',
                      gap: 14,
                      padding: '14px 16px',
                      borderRadius: 12,
                      transition: 'background 0.15s',
                      background: 'transparent',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    <Avatar name={segment.speakerName} image={segment.speakerImage || null} size="md" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{segment.speakerName}</span>
                        <span className={`lang-badge ${langClass}`}>{langLabel}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                          {segment.timestamp}
                        </span>
                      </div>
                      <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
                        <HighlightText text={segment.text} query={searchQuery} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredTranscripts.length === 0 && searchQuery && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: 'var(--muted)',
                  }}
                >
                  <Search size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{tr('report.nothingFound')}</div>
                  <div style={{ fontSize: 12.5, marginTop: 4 }}>
                    {tr('report.tryAnotherSearch')}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}