'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, Sparkles, ChevronRight, RefreshCw, Users, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { AvatarStack } from '@/components/ui/avatar';
import { fmtTime, fmtRelative, zonedFormFields } from '@/lib/utils';
import { useWorkspaceTz } from '@/hooks/use-workspace-tz';
import { useIsMobile } from '@/lib/use-is-mobile';
import s from './page.module.css';

interface Participant {
  user: { id: string; name: string | null; image: string | null } | null;
  guestName: string | null;
}

interface TranscriptMatch {
  language: string;
  snippets: string[];
}

interface Meeting {
  id: string;
  title: string;
  scheduledAt: string | null;
  durationMin: number;
  status: string;
  recurrence?: any;
  createdBy: { id: string; name: string | null; image: string | null };
  participants: Participant[];
  reports?: { id: string }[];
  transcriptMatches?: TranscriptMatch[];
}

type FilterTab = 'all' | 'my' | 'recurring';

const FILTER_TABS: { key: FilterTab; labelKey: string }[] = [
  { key: 'all', labelKey: 'archive.filterAll' },
  { key: 'my', labelKey: 'archive.filterMy' },
  { key: 'recurring', labelKey: 'archive.filterRecurring' },
];

function groupByDay(meetings: Meeting[], locale: string, tz: string): { label: string; date: Date; meetings: Meeting[] }[] {
  const groups = new Map<string, { label: string; date: Date; meetings: Meeting[] }>();

  for (const m of meetings) {
    if (!m.scheduledAt) continue;
    const d = new Date(m.scheduledAt);
    // Group by the calendar day in the workspace zone (not the browser's).
    const dayKey = zonedFormFields(d, tz).date;
    if (!groups.has(dayKey)) {
      groups.set(dayKey, { label: fmtRelative(d, locale, tz), date: d, meetings: [] });
    }
    groups.get(dayKey)!.meetings.push(m);
  }

  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

function getUsers(m: Meeting) {
  return m.participants.map((p) => ({
    name: p.user?.name || p.guestName || 'Guest',
    image: p.user?.image || null,
  }));
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) ? (
      <mark
        key={i}
        className={s.highlight}
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export default function ArchivePage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Meeting | null>(null);
  // When the meeting can't be deleted because it has a saved recording, the API
  // returns 409 — surface that (instead of failing silently) and offer to remove
  // the recording too.
  const [recBlocked, setRecBlocked] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const myId = session?.user?.id;
  // GET /api/meetings already restricts a non-admin to meetings they created or took
  // part in, so for them "Mine" and "All" are the same list by construction. Offering
  // a filter that provably cannot change anything is its own small lie, so only the
  // admins — who really do see everyone's meetings — get the tab.
  const tabs = useMemo(() => FILTER_TABS.filter((t) => t.key !== 'my' || isAdmin), [isAdmin]);
  // The JWT refreshes the role from the database on every request, so an admin can be
  // demoted mid-session. Without this they would keep a filter whose tab has just
  // vanished, with no control left to turn it off.
  const activeFilter: FilterTab = tabs.some((t) => t.key === filter) ? filter : 'all';
  const isMobile = useIsMobile();
  const t = useTranslations();
  const locale = useLocale();
  const tz = useWorkspaceTz();

  const closeConfirm = () => { setConfirmDelete(null); setRecBlocked(false); setDeleteErr(null); };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    setDeleteErr(null);
    try {
      const res = await fetch('/api/meetings/' + confirmDelete.id, { method: 'DELETE' });
      if (res.ok) {
        setMeetings(prev => prev.filter(m => m.id !== confirmDelete.id));
        closeConfirm();
      } else if (res.status === 409) {
        // Blocked because a recording is attached — keep the dialog open and offer
        // to delete the recording along with the meeting.
        setRecBlocked(true);
      } else {
        const d = await res.json().catch(() => ({}));
        setDeleteErr(d.error || t('archive.deleteFailed'));
      }
    } catch (e) {
      console.error(e);
      setDeleteErr(t('archive.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  // Delete the saved recording first (the meeting-delete guard refuses while one
  // exists), then the meeting itself.
  const handleDeleteWithRecording = async () => {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    setDeleteErr(null);
    try {
      const recRes = await fetch(`/api/meetings/${confirmDelete.id}/recording`, { method: 'DELETE' });
      if (!recRes.ok && recRes.status !== 404) {
        const d = await recRes.json().catch(() => ({}));
        setDeleteErr(d.error || t('archive.deleteFailed'));
        return;
      }
      const res = await fetch('/api/meetings/' + confirmDelete.id, { method: 'DELETE' });
      if (res.ok) {
        setMeetings(prev => prev.filter(m => m.id !== confirmDelete.id));
        closeConfirm();
      } else {
        const d = await res.json().catch(() => ({}));
        setDeleteErr(d.error || t('archive.deleteFailed'));
      }
    } catch (e) {
      console.error(e);
      setDeleteErr(t('archive.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/meetings?status=ended')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setMeetings(Array.isArray(data) ? data : data.meetings ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = meetings;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.title.toLowerCase().includes(q));
    }

    if (activeFilter === 'recurring') {
      list = list.filter((m) => m.recurrence);
    }

    // "My meetings" was declared in FILTER_TABS and handled nowhere, so the tab
    // highlighted and the list did not change. Mine = I called it, or I was on it.
    if (activeFilter === 'my' && myId) {
      list = list.filter(
        (m) => m.createdBy?.id === myId || m.participants.some((p) => p.user?.id === myId),
      );
    }

    return list;
  }, [meetings, search, activeFilter, myId]);

  const groups = useMemo(() => groupByDay(filtered, locale, tz), [filtered, locale, tz]);

  return (
    <div className={s.page}>
      <div className={`page-container ${s.container}`}>
        {/* Header */}
        <div className={s.header}>
          <h1 className={s.title}>
            {t('archive.title')}
          </h1>
          <p className={s.subtitle}>
            {t('archive.subtitle')}
          </p>
        </div>

        {/* Search + Filter */}
        <div className={`archive-filter-bar ${s.filterBar}`}>
          {/* Search input */}
          <div
            className={`field ${s.searchField}`}
          >
            <Search size={15} className={s.searchIcon} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('archive.searchPlaceholder')}
              className={s.searchInput}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label={t('common.clear')}
                className={`btn-icon ${s.clearBtn}`}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Segmented filter */}
          <div
            className={s.segmented}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={s.tabBtn}
                style={{
                  fontWeight: activeFilter === tab.key ? 600 : 400,
                  background: activeFilter === tab.key ? 'var(--surface-2)' : 'transparent',
                  color: activeFilter === tab.key ? 'var(--text)' : 'var(--muted)',
                  boxShadow: activeFilter === tab.key ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
                }}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className={s.loadingWrap}>
            <RefreshCw
              size={24}
              className={s.loadingIcon}
            />
            <div className={s.loadingText}>{t('common.loading')}</div>
            <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Empty state */}
        {!loading && groups.length === 0 && (
          <div
            className={`card ${s.emptyCard}`}
          >
            <Search size={48} className={s.emptyIcon} />
            <div className={s.emptyTitle}>
              {search.trim() ? t('archive.emptySearchTitle') : t('archive.emptyTitle')}
            </div>
            <div className={s.emptyDesc}>
              {search.trim()
                ? t('archive.emptySearchDesc', { query: search })
                : t('archive.emptyDesc')}
            </div>
          </div>
        )}

        {/* Delete confirm modal */}
        {confirmDelete && (
          <div className={s.modalOverlay} onClick={closeConfirm}>
            <div className={`card ${s.modalCard}`}
              onClick={e => e.stopPropagation()}>
              <div className={s.modalTitle}>
                {recBlocked ? t('archive.deleteHasRecordingTitle') : t('archive.deleteConfirmTitle')}
              </div>
              <div className={s.modalBody} style={{ marginBottom: deleteErr ? 12 : 20 }}>
                {recBlocked
                  ? t('archive.deleteHasRecordingBody', { title: confirmDelete.title })
                  : t('archive.deleteConfirmBody', { title: confirmDelete.title })}
              </div>
              {deleteErr && (
                <div className={s.modalError}>{deleteErr}</div>
              )}
              <div className={s.modalActions}>
                <button className="btn" onClick={closeConfirm}>{t('common.cancel')}</button>
                <button className={`btn ${s.deleteBtn}`} onClick={recBlocked ? handleDeleteWithRecording : handleDelete} disabled={!!deletingId}>
                  <Trash2 size={14} /> {deletingId ? t('archive.deleting') : (recBlocked ? t('archive.deleteWithRecording') : t('common.delete'))}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results grouped by day */}
        {!loading &&
          groups.map((group, gi) => (
            <div key={gi} className={s.group}>
              {/* Day header */}
              <div
                className={s.dayHeader}
              >
                <span
                  className={s.dayLabel}
                >
                  {group.label}
                </span>
                <div
                  className={s.dayLine}
                />
                <span
                  className={s.dayCount}
                >
                  {t('common.meetings', { count: group.meetings.length })}
                </span>
              </div>

              {/* Meeting rows */}
              <div className={s.rowsWrap}>
                {group.meetings.map((m) => (
                  <MeetingRow key={m.id} meeting={m} searchQuery={search} isAdmin={isAdmin} onDelete={() => { setRecBlocked(false); setDeleteErr(null); setConfirmDelete(m); }} mobile={isMobile} tz={tz} />
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function MeetingRow({ meeting, searchQuery, isAdmin, onDelete, mobile, tz }: { meeting: Meeting; searchQuery: string; isAdmin: boolean; onDelete: () => void; mobile?: boolean; tz: string }) {
  const t = useTranslations();
  const [hovered, setHovered] = useState(false);
  const start = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const end = start ? new Date(start.getTime() + meeting.durationMin * 60000) : null;
  const users = getUsers(meeting);
  const hasReport = meeting.reports && meeting.reports.length > 0;
  const matches = meeting.transcriptMatches;
  const hasTranscriptMatches = matches && matches.length > 0;
  const totalSnippets = hasTranscriptMatches
    ? matches.reduce((sum, tm) => sum + tm.snippets.length, 0)
    : 0;

  return (
    <Link
      href={`/meetings/${meeting.id}/report`}
      className={s.row}
      style={{
        background: hovered ? 'var(--surface-2)' : 'transparent',
        borderColor: hovered ? 'var(--border-2)' : 'var(--border)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Time + duration — desktop: fixed left column; mobile: folded into the meta row */}
      {!mobile && (
        <>
          <div className={s.timeCol}>
            <div className={`mono ${s.timeText}`}>
              {start ? fmtTime(start, tz) : '--:--'}
            </div>
            <div className={`mono ${s.durationText}`}>
              {t('common.minutes', { count: meeting.durationMin })}
            </div>
          </div>
          <div className={s.divider} />
        </>
      )}

      {/* Title + chips + transcript matches */}
      <div className={s.titleWrap}>
        <div className={s.titleRow}>
          <span
            className={s.titleText}
          >
            {meeting.title}
          </span>
          {meeting.recurrence && (
            <span
              className={`chip ${s.recurBadge}`}
            >
              <RefreshCw size={10} /> {t('archive.recurringBadge')}
            </span>
          )}
          {hasReport && (
            <span
              className={`chip ${s.reportBadge}`}
            >
              <Sparkles size={10} /> {t('archive.aiReportBadge')}
            </span>
          )}
        </div>

        <div className={s.metaRow} style={{ flexWrap: mobile ? 'wrap' : 'nowrap' }}>
          {mobile && (
            <>
              <span className={`mono ${s.mobileTimeSpan}`}>{start ? fmtTime(start, tz) : '--:--'} · {t('common.minutes', { count: meeting.durationMin })}</span>
              <span className={s.dotSpan}>&middot;</span>
            </>
          )}
          <span className={s.usersSpan}>
            <Users size={12} />
            {t('common.participants', { count: users.length })}
          </span>
          <span className={s.dotSpan}>&middot;</span>
          <span className={s.createdBySpan}>{meeting.createdBy.name || 'Unknown'}</span>
        </div>

        {/* Transcript matches */}
        {hasTranscriptMatches && (
          <div className={s.matchesWrap}>
            <div
              className={s.matchesLabel}
            >
              {t('archive.foundInTranscript', { count: totalSnippets })}
            </div>
            <div className={s.langBadgesWrap}>
              {matches.map((tm) => (
                <span key={tm.language} className="lang-badge">
                  {tm.language}
                </span>
              ))}
            </div>
            <div className={s.snippetsWrap}>
              {matches.flatMap((tm) =>
                tm.snippets.slice(0, 2).map((snippet, si) => (
                  <div
                    key={`${tm.language}-${si}`}
                    className={s.snippetItem}
                  >
                    &ldquo;...{highlightMatch(snippet, searchQuery)}...&rdquo;
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Avatar stack (hidden on narrow screens — participant count is in the meta row) */}
      <div className={`archive-row-avatars ${s.avatarWrap}`}>
        <AvatarStack users={users} max={4} />
      </div>

      {/* Delete (admin only) */}
      {isAdmin && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          className={`btn btn-ghost btn-icon archive-del-btn ${s.delBtn}`}
          title={t('archive.deleteMeeting')}
          style={{
            color: 'var(--muted)',
            opacity: hovered ? 1 : 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
        >
          <Trash2 size={14} />
        </button>
      )}

      {/* Chevron */}
      <ChevronRight
        size={16}
        className={s.chevron}
        style={{
          opacity: hovered ? 1 : 0.5,
        }}
      />
    </Link>
  );
}
