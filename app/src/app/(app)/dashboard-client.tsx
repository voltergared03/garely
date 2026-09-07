'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { SetupChecklist } from './setup-checklist';
import { InstallAppCard } from '@/components/install-app-card';
import { MyQuizzesCard } from './my-quizzes-card';
import {
  Video, Sparkles, FileText, Users, Clock, RefreshCw, MoreHorizontal,
  Pencil, Trash2, X, Search, Send, Calendar as CalendarIcon, Save,
  ListChecks, Check, Plus, CheckCircle, Wand2, Loader2 as Loader2Icon,
} from 'lucide-react';
import { AvatarStack, Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { fmtTime, fmtRelative, isToday, dayDiff, zonedHour, zonedFormFields, zonedWallTimeToUtcISO } from '@/lib/utils';
import s from './dashboard-client.module.css';

type Tr = ReturnType<typeof useTranslations>;

interface Meeting {
  id: string;
  title: string;
  scheduledAt: string | null;
  durationMin: number;
  status: string;
  description?: string | null;
  recurrence?: any;
  createdBy: { id: string; name: string | null; image: string | null };
  participants: {
    id?: string;
    userId?: string | null;
    user: { id: string; name: string | null; image: string | null } | null;
    guestName: string | null;
    role?: string;
  }[];
  reports?: { id: string }[];
  agenda?: string[] | null;
}

interface WsUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface DashTask {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
  source?: string;
  meetingId: string;
  assignee: { id: string; name: string | null; image: string | null } | null;
  meeting?: { id: string; title: string; scheduledAt: string | null };
}

// Short "time until" label for the mobile next-meeting hero. `nowMs` is the
// server request time (passed through) so SSR and hydration agree — using
// Date.now() here would differ between the two renders and trip a #418.
function untilLabel(d: string | null, tr: Tr, nowMs: number): string | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - nowMs;
  if (diff <= 60_000) return tr('dashboard.now');
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return tr('dashboard.inMinutes', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    const rem = mins % 60;
    return rem
      ? tr('dashboard.inHoursMinutes', { hours: hrs, minutes: rem })
      : tr('dashboard.inHours', { hours: hrs });
  }
  return null; // farther out — the date line covers it
}

function dueLabel(d: string | null, locale: string, tr: Tr, tz: string, nowMs: number): { txt: string; overdue: boolean; soon: boolean } | null {
  if (!d) return null;
  const diff = dayDiff(new Date(d), tz, new Date(nowMs));
  if (diff === 0) return { txt: tr('common.today'), overdue: false, soon: true };
  if (diff === 1) return { txt: tr('common.tomorrow'), overdue: false, soon: true };
  if (diff < 0) return { txt: tr('dashboard.overdueDays', { count: -diff }), overdue: true, soon: false };
  if (diff < 7) return { txt: new Date(d).toLocaleDateString(locale, { weekday: 'short', timeZone: tz }), overdue: false, soon: diff < 3 };
  return { txt: new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: tz }), overdue: false, soon: false };
}

export function DashboardClient({
  userName,
  tz,
  nowMs,
  upcoming: initialUpcoming,
  past: initialPast,
  myTasks: initialMyTasks,
}: {
  userName?: string | null;
  tz: string;
  nowMs: number;
  upcoming: Meeting[];
  past: Meeting[];
  myTasks: DashTask[];
}) {
  const router = useRouter();
  const tr = useTranslations();
  const locale = useLocale();
  // Pinned to the server request instant + workspace zone so every date/time
  // below renders identically on the server and on hydration (no #418).
  const now = new Date(nowMs);
  const [upcoming, setUpcoming] = useState(initialUpcoming);
  const [past, setPast] = useState(initialPast);
  const [myTasks, setMyTasks] = useState(initialMyTasks);
  const overdueCount = myTasks.filter(t => dueLabel(t.dueDate, locale, tr, tz, nowMs)?.overdue).length;
  const hour = zonedHour(now, tz);
  const greetingText = tr(
    `dashboard.${hour < 5 ? 'greetingNight' : hour < 12 ? 'greetingMorning' : hour < 18 ? 'greetingAfternoon' : 'greetingEvening'}`
  );
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [deleteMeeting, setDeleteMeeting] = useState<Meeting | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const getParticipantNames = (m: Meeting) =>
    m.participants.map((p) => ({
      name: p.user?.name || p.guestName || 'Guest',
      image: p.user?.image || null,
    }));

  // Hide a meeting once its scheduled END time (scheduledAt + duration) has
  // passed — e.g. a 13:00–13:45 meeting disappears as "next" right after 13:45.
  // An overdue `scheduled` meeting that never started must not surface as next.
  // `live` (in progress) and untimed meetings always stay.
  const stillUpcoming = (m: Meeting) =>
    m.status === 'live' ||
    !m.scheduledAt ||
    new Date(m.scheduledAt).getTime() + (m.durationMin || 60) * 60_000 >= nowMs;
  const visibleUpcoming = upcoming.filter(stillUpcoming);

  const today = visibleUpcoming.filter(
    (m) => m.scheduledAt && isToday(new Date(m.scheduledAt), tz, now)
  );
  const later = visibleUpcoming.filter(
    (m) => !m.scheduledAt || !isToday(new Date(m.scheduledAt), tz, now)
  );

  const nextMeeting = today[0] || visibleUpcoming[0];

  const handleDelete = async () => {
    if (!deleteMeeting) return;
    try {
      const res = await fetch(`/api/meetings/${deleteMeeting.id}`, { method: 'DELETE' });
      if (res.ok) {
        setUpcoming(prev => prev.filter(m => m.id !== deleteMeeting.id));
        setPast(prev => prev.filter(m => m.id !== deleteMeeting.id));
        setDeleteMeeting(null);
      }
    } catch (e) { console.error(e); }
  };

  const handleEditSave = async (updated: Meeting) => {
    setUpcoming(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
    setPast(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
    setEditMeeting(null);
    router.refresh();
  };

  return (
    <div className={s.root}>
      <div className={`page-container ${s.page}`}>
        <SetupChecklist />
        <InstallAppCard />
        {/* ── Mobile-redesigned top: greeting + next-meeting hero + quick actions ── */}
        <div className="dash-mobile-top">
          {/* Greeting */}
          <div className={s.greetingBlock}>
            <h1 className={s.greetingTitle}>
              {greetingText}{userName ? `, ${userName.split(' ')[0]}` : ''}
            </h1>
            <div className={s.greetingDate}>
              {now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })}
            </div>
          </div>

          {/* Next meeting */}
          {nextMeeting ? (
            <div className={`card ${s.heroCard}`}>
              <div aria-hidden className={s.heroGlow} />
              <div className={s.heroTopRow}>
                <span className={`chip ${s.heroChip}`}>
                  <Sparkles size={11} /> {tr('dashboard.next')}
                </span>
                {untilLabel(nextMeeting.scheduledAt, tr, nowMs) && (
                  <span className={s.heroUntil}>{untilLabel(nextMeeting.scheduledAt, tr, nowMs)}</span>
                )}
              </div>
              <div className={s.rel}>
                <div className={s.heroTitle}>{nextMeeting.title}</div>
                {nextMeeting.scheduledAt && (
                  <div className={s.heroMeta}>
                    {fmtRelative(new Date(nextMeeting.scheduledAt), locale, tz, now)} · {fmtTime(new Date(nextMeeting.scheduledAt), tz)} · {tr('common.minutes', { count: nextMeeting.durationMin })}
                  </div>
                )}
              </div>
              <div className={s.rel}>
                <AvatarStack users={getParticipantNames(nextMeeting)} max={5} size="md" />
              </div>
              <Link href={`/lobby/${nextMeeting.id}`} className={`btn btn-primary ${s.heroJoin}`}>
                <Video size={16} /> {tr('common.join')}
              </Link>
            </div>
          ) : (
            <div className={`card ${s.emptyHero}`}>
              <div className={s.emptyIcon}>
                <CalendarIcon size={24} className={s.accentIcon} />
              </div>
              <div className={s.emptyTitle}>{tr('dashboard.noMeetingsToday')}</div>
              <div className={s.emptyDesc}>{tr('dashboard.noMeetingsTodayHint')}</div>
              <Link href="/schedule" className={`btn btn-primary ${s.emptyCta}`}>
                <Plus size={15} /> {tr('dashboard.scheduleMeeting')}
              </Link>
            </div>
          )}

          {/* Quick actions — start now or schedule */}
          <div className={s.quickGrid}>
            <Link href="/lobby/quick" className={`card ${s.quickCard}`}>
              <div className={s.quickIcon}>
                <Video size={18} className={s.accentIcon} />
              </div>
              <span className={s.quickLabel}>{tr('sidebar.quickMeeting')}</span>
            </Link>
            <Link href="/schedule" className={`card ${s.quickCard}`}>
              <div className={s.quickIconGreen}>
                <Plus size={18} className={s.greenIcon} />
              </div>
              <span className={s.quickLabel}>{tr('dashboard.scheduleMeeting')}</span>
            </Link>
          </div>
        </div>

        {/* ── Desktop top: original hero (unchanged) ── */}
        <div className="dash-desktop-top">
          <div className={`dash-hero ${s.desktopHero}`}>
            <div
              className={`card ${s.deskHeroCard}`}
            >
              <div className={s.deskHeroRow}>
                <span
                  className={`chip ${s.deskHeroChip}`}
                >
                  <Sparkles size={11} /> {tr('dashboard.nextMeeting')}
                </span>
              </div>
              {nextMeeting ? (
                <>
                  <div>
                    <div className={s.deskHeroTitle}>
                      {nextMeeting.title}
                    </div>
                    {nextMeeting.scheduledAt && (
                      <div className={s.deskHeroMeta}>
                        {fmtRelative(new Date(nextMeeting.scheduledAt), locale, tz, now)} &bull;{' '}
                        {fmtTime(new Date(nextMeeting.scheduledAt), tz)} &bull; {tr('common.minutes', { count: nextMeeting.durationMin })}
                      </div>
                    )}
                  </div>
                  {nextMeeting.description && (
                    <div className={s.deskHeroDesc}>
                      {nextMeeting.description}
                    </div>
                  )}
                  <div className={s.deskHeroFooter}>
                    <AvatarStack users={getParticipantNames(nextMeeting)} max={6} size="md" />
                    <div className={s.actionRow}>
                      <Link href={`/lobby/${nextMeeting.id}`} className={`btn btn-primary ${s.noUnderline}`}>
                        <Video size={15} /> {tr('common.join')}
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                <div className={s.deskHeroEmpty}>{tr('dashboard.noMeetingsTodayDesktop')}</div>
              )}
            </div>
          </div>
        </div>

        {/* My Tasks */}
        <Section title={tr('dashboard.myTasks')} right={
          <div className={s.sectionRight}>
            {overdueCount > 0 && (
              <span className={s.overdueBadge}>
                {tr('dashboard.overdue', { count: overdueCount })}
              </span>
            )}
            <Link href="/tasks" className={`btn btn-ghost btn-sm ${s.allLink}`}>
              {tr('dashboard.all')} &rarr;
            </Link>
          </div>
        }>
          {myTasks.length === 0 ? (
            <div className={`card ${s.noTasks}`}>
              <CheckCircle size={20} className={s.greenIcon} />
              {tr('dashboard.noTasks')}
            </div>
          ) : (
            <div className={`card ${s.taskList}`}>
              {myTasks.slice(0, 5).map((t, i) => {
                const due = dueLabel(t.dueDate, locale, tr, tz, nowMs);
                const isOverdue = due?.overdue;
                return (
                  <Link key={t.id} href="/tasks" className={s.taskRow} style={{
                    borderBottom: i === Math.min(4, myTasks.length - 1) ? 'none' : '1px solid var(--border)',
                    borderLeft: isOverdue ? '3px solid var(--red)' : '3px solid transparent',
                    paddingLeft: isOverdue ? 13 : 16,
                  }}
                    onMouseEnter={(e: any) => (e.currentTarget.style.background = 'var(--surface-2, #2a2a32)')}
                    onMouseLeave={(e: any) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className={s.taskCheck} style={{
                      border: `1.5px solid ${t.status === 'in_progress' ? 'var(--amber)' : 'var(--border)'}`,
                    }}>
                      {t.status === 'in_progress' && <span className={s.taskDot} />}
                    </span>
                    <span className={s.priorityDot} style={{
                      background: t.priority === 'high' ? 'var(--red)' : t.priority === 'medium' ? 'var(--amber)' : 'var(--muted)',
                    }} />
                    {t.source === 'ai' && <Sparkles size={11} className={s.aiIcon} />}
                    <span className={s.taskTitle}>{t.title}</span>
                    {due && (
                      <span className={s.duePill} style={{
                        fontWeight: isOverdue ? 600 : 500,
                        background: isOverdue ? 'color-mix(in oklab, var(--red) 18%, transparent)' : 'transparent',
                        color: isOverdue ? '#fca5a5' : due.soon ? '#fcd34d' : 'var(--muted)',
                      }}>{due.txt}</span>
                    )}
                  </Link>
                );
              })}
              {myTasks.length > 5 && (
                <Link href="/tasks" className={s.moreLink} style={{
                  background: 'var(--surface-2, #2a2a32)',
                }}>
                  {tr('dashboard.moreTasks', { count: myTasks.length - 5 })} &rarr;
                </Link>
              )}
            </div>
          )}
        </Section>

        <MyQuizzesCard />

        {/* Today */}
        {today.length > 0 && (
          <Section title={tr('dashboard.today')} right={tr('common.meetings', { count: today.length })}>
            <div className={s.stackList}>
              {today.map((m) => (
                <MeetingRow key={m.id} meeting={m} users={getParticipantNames(m)} tz={tz}
                  menuOpen={menuOpen} setMenuOpen={setMenuOpen}
                  onEdit={() => setEditMeeting(m)} onDelete={() => setDeleteMeeting(m)} />
              ))}
            </div>
          </Section>
        )}

        {/* Upcoming */}
        {later.length > 0 && (
          <Section title={tr('dashboard.upcoming')}>
            <div className={`dash-upcoming-grid ${s.grid14}`}>
              {later.slice(0, 4).map((m) => (
                <MeetingCard key={m.id} meeting={m} users={getParticipantNames(m)} tz={tz} now={now}
                  menuOpen={menuOpen} setMenuOpen={setMenuOpen}
                  onEdit={() => setEditMeeting(m)} onDelete={() => setDeleteMeeting(m)} />
              ))}
            </div>
          </Section>
        )}

        {/* Recent reports */}
        {past.length > 0 && (
          <Section
            title={tr('dashboard.recentReports')}
            right={
              <Link href="/archive" className={`btn btn-ghost btn-sm ${s.noUnderline}`}>
                {tr('nav.archive')} &rarr;
              </Link>
            }
          >
            <div className={`dash-reports-grid ${s.grid14}`}>
              {past.slice(0, 3).map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}/report`}
                  className={`card ${s.reportCard}`}
                >
                  <div className={s.reportMeta}>
                    <Sparkles size={12} className={s.accent2Icon} />
                    <span className="mono">
                      {m.scheduledAt ? fmtRelative(new Date(m.scheduledAt), locale, tz, now) : ''}
                    </span>
                  </div>
                  <div className={s.reportTitle}>{m.title}</div>
                  <AvatarStack users={getParticipantNames(m)} max={5} />
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* Empty state */}
        {upcoming.length === 0 && past.length === 0 && (
          <div className={`card ${s.welcomeCard}`}>
            <div className={s.welcomeIcon}>
              <Video size={18} className={s.accentIcon} />
            </div>
            <div className={s.flexMin}>
              <div className={s.welcomeTitle}>{tr('dashboard.welcomeTitle')}</div>
              <div className={s.welcomeDesc}>{tr('dashboard.welcomeDesc')}</div>
            </div>
            <Link href="/schedule" className={`btn btn-primary btn-sm ${s.noUnderlineShrink}`}>
              <Video size={13} /> {tr('dashboard.createMeeting')}
            </Link>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editMeeting && (
        <EditMeetingModal meeting={editMeeting} tz={tz} onClose={() => setEditMeeting(null)} onSave={handleEditSave} />
      )}

      {/* Delete Confirm */}
      {deleteMeeting && (
        <div className={s.overlay} onClick={() => setDeleteMeeting(null)}>
          <div className={`card ${s.confirmCard}`}
            onClick={e => e.stopPropagation()}>
            <div className={s.confirmTitle}>{tr('dashboard.deleteMeetingTitle')}</div>
            <div className={s.confirmDesc}>
              {tr('dashboard.deleteMeetingDesc', { title: deleteMeeting.title })}
            </div>
            <div className={s.modalActions}>
              <button className="btn" onClick={() => setDeleteMeeting(null)}>{tr('common.cancel')}</button>
              <button className={`btn ${s.dangerBtn}`} onClick={handleDelete}>
                <Trash2 size={14} /> {tr('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Edit Meeting Modal ─────────────────────── */

function EditMeetingModal({ meeting, tz, onClose, onSave }: {
  meeting: Meeting;
  tz: string;
  onClose: () => void;
  onSave: (m: Meeting) => void;
}) {
  const t = useTranslations();
  const schedAt = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  // Render the date/time inputs as workspace-local wall-clock (not the browser's
  // zone), so editing doesn't silently shift the meeting time across zones.
  const initFields = schedAt ? zonedFormFields(schedAt, tz) : null;
  const [title, setTitle] = useState(meeting.title);
  const [description, setDescription] = useState(meeting.description || '');
  const [date, setDate] = useState(initFields?.date ?? '');
  const [time, setTime] = useState(initFields?.time ?? '14:00');
  const [duration, setDuration] = useState(meeting.durationMin);
  const [saving, setSaving] = useState(false);
  const [agenda, setAgenda] = useState<string[]>(Array.isArray(meeting.agenda) ? meeting.agenda : []);
  const [newAgendaItem, setNewAgendaItem] = useState('');
  const [aiAgendaLoading, setAiAgendaLoading] = useState(false);

  const generateAgenda = async () => {
    if (aiAgendaLoading || title.trim().length < 3) return;
    setAiAgendaLoading(true);
    try {
      const res = await fetch('/api/meetings/ai-agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          currentAgenda: agenda.length > 0 ? agenda : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agenda && data.agenda.length > 0) setAgenda(data.agenda);
      }
    } catch (e) { console.error('AI agenda failed:', e); }
    finally { setAiAgendaLoading(false); }
  };

  // Participants
  const [allUsers, setAllUsers] = useState<WsUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<WsUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setAllUsers(data);
        // Pre-select current participants (non-host)
        const participantUserIds = meeting.participants
          .filter(p => p.role !== 'host' && p.user)
          .map(p => p.user!.id);
        const selected = data.filter((u: WsUser) => participantUserIds.includes(u.id));
        setSelectedUsers(selected);
      })
      .catch(console.error);
  }, [meeting.participants]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hostId = meeting.createdBy.id;
  const filteredUsers = allUsers.filter(u => {
    if (u.id === hostId) return false;
    if (selectedUsers.some(s => s.id === u.id)) return false;
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  });

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const scheduledAt = date && time ? zonedWallTimeToUtcISO(date, time, tz) : null;
      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          scheduledAt,
          durationMin: duration,
          participants: selectedUsers.map(u => ({ userId: u.id })),
          agenda: agenda.length > 0 ? agenda : null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onSave(updated);
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <div className={`${s.overlay} ${s.overlayScroll}`} onClick={onClose}>
      <div className={`card ${s.editCard}`}
        onClick={e => e.stopPropagation()}>
        <div className={s.editHeader}>
          <div className={s.editTitle}>{t('dashboard.editMeeting')}</div>
          <button className="btn btn-ghost btn-icon" aria-label={t('common.close')} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={s.editBody}>
          <div>
            <label className="field-label">{t('meetingForm.title')}</label>
            <input className="field" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="field-label">{t('meetingForm.description')}</label>
            <textarea className={`field ${s.noResize}`} rows={2} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('meetingForm.descriptionPlaceholder')} />
          </div>
          {/* Agenda */}
          <div>
            <div className={s.agendaHead}>
              <label className={`field-label ${s.agendaLabel}`}>
                <ListChecks size={11} /> {t('meetingForm.agenda')} ({agenda.length})
              </label>
              <button type="button" onClick={generateAgenda}
                disabled={aiAgendaLoading || title.trim().length < 3}
                className={s.aiBtn}
                style={{
                  color: title.trim().length < 3 ? 'var(--muted)' : 'var(--accent)',
                  cursor: aiAgendaLoading || title.trim().length < 3 ? 'not-allowed' : 'pointer',
                  opacity: title.trim().length < 3 ? 0.5 : 1,
                }}>
                {aiAgendaLoading ? <Loader2Icon size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={11} />}
                AI
              </button>
            </div>
            {agenda.map((item, idx) => (
              <div key={idx} className={s.agendaItem}>
                <span className={s.agendaIdx}>{idx + 1}</span>
                <input value={item} onChange={e => setAgenda(prev => prev.map((x, i) => i === idx ? e.target.value : x))}
                  className={s.agendaInput} />
                <button type="button" onClick={() => setAgenda(prev => prev.filter((_, i) => i !== idx))}
                  className={s.agendaDel}>
                  <X size={10} />
                </button>
              </div>
            ))}
            <div className={s.agendaAddRow}>
              <input className={`field ${s.agendaAddInput}`} placeholder={t('meetingForm.addAgendaItem')} value={newAgendaItem}
                onChange={e => setNewAgendaItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newAgendaItem.trim()) { setAgenda(p => [...p, newAgendaItem.trim()]); setNewAgendaItem(''); } } }} />
              <button type="button" className={`btn btn-sm ${s.shrink0}`} onClick={() => { if (newAgendaItem.trim()) { setAgenda(p => [...p, newAgendaItem.trim()]); setNewAgendaItem(''); } }}
                disabled={!newAgendaItem.trim()}>
                <Plus size={12} />
              </button>
            </div>
          </div>

          <div className={s.grid3}>
            <div className={s.minW0}>
              <label className="field-label"><CalendarIcon size={11} /> {t('meetingForm.date')}</label>
              <input className={`field ${s.minW0}`} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className={s.minW0}>
              <label className="field-label">{t('meetingForm.time')}</label>
              <input className={`field ${s.minW0}`} type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div className={s.minW0}>
              <label className="field-label">{t('meetingForm.duration')}</label>
              <Select value={String(duration)} onChange={(v) => setDuration(parseInt(v))} className={s.minW0}
                options={[15, 30, 45, 60, 90, 120].map(d => ({ value: String(d), label: t('common.minutes', { count: d }) }))} />
            </div>
          </div>

          {/* Participants */}
          <div>
            <label className="field-label"><Users size={11} /> {t('meetingForm.participants')} ({selectedUsers.length + 1})</label>

            {/* Host */}
            <div className={s.pRow}>
              <Avatar name={meeting.createdBy.name || 'U'} image={meeting.createdBy.image} size="sm" />
              <div className={s.pName}>{meeting.createdBy.name}</div>
              <span className={`chip ${s.chipXs}`}>{t('common.host')}</span>
            </div>

            {selectedUsers.map(u => (
              <div key={u.id} className={s.pRowSel}>
                <Avatar name={u.name || 'U'} image={u.image} size="sm" />
                <div className={s.pNameSel}>{u.name}</div>
                <button className={`btn btn-ghost btn-icon ${s.btn24}`}
                  aria-label={t('common.delete')}
                  onClick={() => setSelectedUsers(p => p.filter(x => x.id !== u.id))}>
                  <X size={11} />
                </button>
              </div>
            ))}

            <div ref={searchRef} className={s.searchWrap}>
              <div className={s.rel}>
                <Search size={13} className={s.searchIcon} />
                <input className={`field ${s.searchInput}`} placeholder={t('meetingForm.addParticipant')}
                  value={userSearch} onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)} />
              </div>
              {showDropdown && filteredUsers.length > 0 && (
                <div className={s.dropdown} style={{
                  boxShadow: '0 8px 24px rgba(0,0,0,.3)',
                }}>
                  {filteredUsers.slice(0, 6).map(u => (
                    <button key={u.id} onClick={() => { setSelectedUsers(p => [...p, u]); setUserSearch(''); setShowDropdown(false); }}
                      className={s.dropItem}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Avatar name={u.name || 'U'} image={u.image} size="sm" />
                      <div>
                        <div className={s.dropName}>{u.name}</div>
                        <div className={s.dropEmail}>{u.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={s.editActions}>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim()}>
            <Save size={14} /> {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Context Menu ─────────────────────────────── */

function MeetingMenu({ meetingId, menuOpen, setMenuOpen, onEdit, onDelete }: {
  meetingId: string;
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const ref = useRef<HTMLDivElement>(null);
  const isOpen = menuOpen === meetingId;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, setMenuOpen]);

  return (
    <div ref={ref} className={s.rel}>
      <button className={`btn btn-ghost btn-icon ${s.btn30}`}
        aria-label={t('common.options')}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(isOpen ? null : meetingId); }}>
        <MoreHorizontal size={15} />
      </button>
      {isOpen && (
        <div className={s.menu} style={{
          boxShadow: '0 8px 24px rgba(0,0,0,.3)',
        }}>
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(null); onEdit(); }}
            className={s.menuItem}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Pencil size={13} /> {t('common.edit')}
          </button>
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(null); onDelete(); }}
            className={`${s.menuItem} ${s.menuItemDanger}`}
            onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in oklab, var(--red) 10%, transparent)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Trash2 size={13} /> {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Shared components ─────────────────────────── */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{title}</h2>
        {right && (typeof right === 'string' ? <span className={s.sectionRightText}>{right}</span> : right)}
      </div>
      {children}
    </section>
  );
}

function MeetingRow({ meeting, users, tz, menuOpen, setMenuOpen, onEdit, onDelete }: {
  meeting: Meeting;
  users: { name: string; image: string | null }[];
  tz: string;
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const start = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  return (
    <div
      className={s.meetingRow}
    >
      <div className={s.rowTime}>
        <div className={`mono ${s.rowTimeVal}`}>
          {start ? fmtTime(start, tz) : '--:--'}
        </div>
        <div className={`mono ${s.rowTimeDur}`}>
          {t('common.minutes', { count: meeting.durationMin })}
        </div>
      </div>
      <div className={s.rowDivider} />
      <Link href={`/lobby/${meeting.id}`} className={s.rowLink}>
        <div className={s.rowTitle}>
          {meeting.title}
        </div>
        <div className={s.rowMeta}>
          <span>{t('common.participants', { count: users.length })}</span>
        </div>
      </Link>
      <AvatarStack users={users} max={3} />
      <Link href={`/lobby/${meeting.id}`} className={`btn btn-sm btn-primary ${s.noUnderlineShrink}`}>
        <Video size={13} />
      </Link>
      {meeting.status !== 'ended' && (
        <MeetingMenu meetingId={meeting.id} menuOpen={menuOpen} setMenuOpen={setMenuOpen}
          onEdit={onEdit} onDelete={onDelete} />
      )}
    </div>
  );
}

function MeetingCard({ meeting, users, tz, now, menuOpen, setMenuOpen, onEdit, onDelete }: {
  meeting: Meeting;
  users: { name: string; image: string | null }[];
  tz: string;
  now: Date;
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const start = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const end = start ? new Date(start.getTime() + meeting.durationMin * 60000) : null;

  return (
    <div className={`card ${s.mcard}`}>
      <div className={s.mcardTop}>
        <div className={s.flexMin}>
          <div className={s.mcardTimeRow}>
            <span className={`mono ${s.mcardTime}`}>
              {start ? `${fmtTime(start, tz)}–${end ? fmtTime(end, tz) : ''}` : ''}
            </span>
            {meeting.recurrence && (
              <span className="chip">
                <RefreshCw size={11} /> {t('dashboard.weekly')}
              </span>
            )}
          </div>
          <div className={s.mcardTitle}>{meeting.title}</div>
          <div className={s.mcardMeta}>
            {start ? fmtRelative(start, locale, tz, now) : ''} &bull; {t('common.minutes', { count: meeting.durationMin })}
          </div>
        </div>
        {meeting.status !== 'ended' && (
          <MeetingMenu meetingId={meeting.id} menuOpen={menuOpen} setMenuOpen={setMenuOpen}
            onEdit={onEdit} onDelete={onDelete} />
        )}
      </div>
      <div className={s.mcardFooter}>
        <AvatarStack users={users} max={5} />
        <Link href={`/lobby/${meeting.id}`} className={`btn btn-sm btn-primary ${s.noUnderline}`}>
          <Video size={13} /> {t('common.join')}
        </Link>
      </div>
    </div>
  );
}
