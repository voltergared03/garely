'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SetupChecklist } from './setup-checklist';
import { InstallAppCard } from '@/components/install-app-card';
import {
  Video, Sparkles, FileText, Users, Clock, RefreshCw, MoreHorizontal,
  Pencil, Trash2, X, Search, Send, Calendar as CalendarIcon, Save,
  ListChecks, Check, Plus, CheckCircle, Wand2, Loader2 as Loader2Icon,
} from 'lucide-react';
import { AvatarStack, Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { fmtTime, fmtRelative, fmtDateLong } from '@/lib/utils';

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

function dueLabel(d: string | null): { txt: string; overdue: boolean; soon: boolean } | null {
  if (!d) return null;
  const due = new Date(d); due.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return { txt: 'Сьогодні', overdue: false, soon: true };
  if (diff === 1) return { txt: 'Завтра', overdue: false, soon: true };
  if (diff === -1) return { txt: 'Прострочено 1д', overdue: true, soon: false };
  if (diff < -1) return { txt: `Прострочено ${-diff}д`, overdue: true, soon: false };
  if (diff < 7) return { txt: new Date(d).toLocaleDateString('uk', { weekday: 'short' }), overdue: false, soon: diff < 3 };
  return { txt: new Date(d).toLocaleDateString('uk', { day: 'numeric', month: 'short' }), overdue: false, soon: false };
}

export function DashboardClient({
  upcoming: initialUpcoming,
  past: initialPast,
  myTasks: initialMyTasks,
}: {
  upcoming: Meeting[];
  past: Meeting[];
  myTasks: DashTask[];
}) {
  const router = useRouter();
  const [upcoming, setUpcoming] = useState(initialUpcoming);
  const [past, setPast] = useState(initialPast);
  const [myTasks, setMyTasks] = useState(initialMyTasks);
  const overdueCount = myTasks.filter(t => dueLabel(t.dueDate)?.overdue).length;
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [deleteMeeting, setDeleteMeeting] = useState<Meeting | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const getParticipantNames = (m: Meeting) =>
    m.participants.map((p) => ({
      name: p.user?.name || p.guestName || 'Guest',
      image: p.user?.image || null,
    }));

  const today = upcoming.filter(
    (m) => m.scheduledAt && fmtRelative(new Date(m.scheduledAt)) === 'Сьогодні'
  );
  const later = upcoming.filter(
    (m) => !m.scheduledAt || fmtRelative(new Date(m.scheduledAt)) !== 'Сьогодні'
  );

  const nextMeeting = today[0] || upcoming[0];

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
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
      <div className='page-container' style={{ maxWidth: 1100, margin: '0 auto' }}>
        <SetupChecklist />
        <InstallAppCard />
        {/* Hero / Next meeting */}
        <div className='dash-hero' style={{ display: 'grid', gap: 18, marginBottom: 24 }}>
          <div
            className="card"
            style={{
              padding: 24,
              background:
                'linear-gradient(135deg, color-mix(in oklab, var(--accent) 14%, var(--surface)) 0%, var(--surface) 60%)',
              borderColor: 'color-mix(in oklab, var(--accent) 30%, var(--border))',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className="chip"
                style={{
                  background: 'color-mix(in oklab, var(--accent) 18%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--accent) 40%, transparent)',
                  color: '#bfdbfe',
                }}
              >
                <Sparkles size={11} /> Наступний мітинг
              </span>
            </div>
            {nextMeeting ? (
              <>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
                    {nextMeeting.title}
                  </div>
                  {nextMeeting.scheduledAt && (
                    <div style={{ color: 'var(--text-2)', fontSize: 13.5 }}>
                      {fmtRelative(new Date(nextMeeting.scheduledAt))} &bull;{' '}
                      {fmtTime(new Date(nextMeeting.scheduledAt))} &bull; {nextMeeting.durationMin} хв
                    </div>
                  )}
                </div>
                {nextMeeting.description && (
                  <div style={{ color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.55 }}>
                    {nextMeeting.description}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <AvatarStack users={getParticipantNames(nextMeeting)} max={6} size="md" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Link href={`/lobby/${nextMeeting.id}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
                      <Video size={15} /> Приєднатися
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--muted)', padding: '20px 0' }}>Мітингів на сьогодні немає</div>
            )}
          </div>


        </div>

        {/* My Tasks */}
        <Section title="Мої таски" right={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {overdueCount > 0 && (
              <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 5,
                background: 'color-mix(in oklab, var(--red) 18%, transparent)', color: '#fca5a5', fontWeight: 600 }}>
                {overdueCount} прострочено
              </span>
            )}
            <Link href="/tasks" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', color: 'var(--muted)' }}>
              Усі &rarr;
            </Link>
          </div>
        }>
          {myTasks.length === 0 ? (
            <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--muted)', fontSize: 13.5 }}>
              <CheckCircle size={20} style={{ color: 'var(--green)' }} />
              Жодної відкритої таски — все під контролем.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {myTasks.slice(0, 5).map((t, i) => {
                const due = dueLabel(t.dueDate);
                const isOverdue = due?.overdue;
                return (
                  <Link key={t.id} href="/tasks" style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                    borderBottom: i === Math.min(4, myTasks.length - 1) ? 'none' : '1px solid var(--border)',
                    borderLeft: isOverdue ? '3px solid var(--red)' : '3px solid transparent',
                    paddingLeft: isOverdue ? 13 : 16,
                    textDecoration: 'none', color: 'inherit', transition: 'background .15s',
                  }}
                    onMouseEnter={(e: any) => (e.currentTarget.style.background = 'var(--surface-2, #2a2a32)')}
                    onMouseLeave={(e: any) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `1.5px solid ${t.status === 'in_progress' ? 'var(--amber)' : 'var(--border)'}`,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {t.status === 'in_progress' && <span style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--amber)' }} />}
                    </span>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: t.priority === 'high' ? 'var(--red)' : t.priority === 'medium' ? 'var(--amber)' : 'var(--muted)',
                    }} />
                    {t.source === 'ai' && <Sparkles size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    {due && (
                      <span style={{
                        fontSize: 11.5, padding: '2px 7px', borderRadius: 5, fontWeight: isOverdue ? 600 : 500,
                        background: isOverdue ? 'color-mix(in oklab, var(--red) 18%, transparent)' : 'transparent',
                        color: isOverdue ? '#fca5a5' : due.soon ? '#fcd34d' : 'var(--muted)',
                      }}>{due.txt}</span>
                    )}
                  </Link>
                );
              })}
              {myTasks.length > 5 && (
                <Link href="/tasks" style={{
                  display: 'block', padding: '10px 16px', background: 'var(--surface-2, #2a2a32)',
                  textDecoration: 'none', color: 'var(--muted)', fontSize: 12.5, textAlign: 'center',
                }}>
                  + ще {myTasks.length - 5} тасок &rarr;
                </Link>
              )}
            </div>
          )}
        </Section>

        {/* Today */}
        {today.length > 0 && (
          <Section title="Сьогодні" right={`${today.length} мітинг${today.length === 1 ? '' : today.length < 5 ? 'и' : 'ів'}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {today.map((m) => (
                <MeetingRow key={m.id} meeting={m} users={getParticipantNames(m)}
                  menuOpen={menuOpen} setMenuOpen={setMenuOpen}
                  onEdit={() => setEditMeeting(m)} onDelete={() => setDeleteMeeting(m)} />
              ))}
            </div>
          </Section>
        )}

        {/* Upcoming */}
        {later.length > 0 && (
          <Section title="Найближчі мітинги">
            <div className='dash-upcoming-grid' style={{ display: 'grid', gap: 14 }}>
              {later.slice(0, 4).map((m) => (
                <MeetingCard key={m.id} meeting={m} users={getParticipantNames(m)}
                  menuOpen={menuOpen} setMenuOpen={setMenuOpen}
                  onEdit={() => setEditMeeting(m)} onDelete={() => setDeleteMeeting(m)} />
              ))}
            </div>
          </Section>
        )}

        {/* Recent reports */}
        {past.length > 0 && (
          <Section
            title="Недавні звіти"
            right={
              <Link href="/archive" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                Архів &rarr;
              </Link>
            }
          >
            <div className='dash-reports-grid' style={{ display: 'grid', gap: 14 }}>
              {past.slice(0, 3).map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}/report`}
                  className="card"
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 11.5 }}>
                    <Sparkles size={12} style={{ color: 'var(--accent-2)' }} />
                    <span className="mono">
                      {m.scheduledAt ? fmtRelative(new Date(m.scheduledAt)) : ''}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.title}</div>
                  <AvatarStack users={getParticipantNames(m)} max={5} />
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* Empty state */}
        {upcoming.length === 0 && past.length === 0 && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Video size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Ласкаво просимо до EAM Meet</div>
              <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Створіть свій перший мітинг, щоб почати</div>
            </div>
            <Link href="/schedule" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', flexShrink: 0 }}>
              <Video size={13} /> Створити мітинг
            </Link>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editMeeting && (
        <EditMeetingModal meeting={editMeeting} onClose={() => setEditMeeting(null)} onSave={handleEditSave} />
      )}

      {/* Delete Confirm */}
      {deleteMeeting && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setDeleteMeeting(null)}>
          <div className="card" style={{ maxWidth: 420, width: '100%', padding: '28px 24px' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Видалити мітинг?</div>
            <div style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
              Ви впевнені що хочете видалити &laquo;{deleteMeeting.title}&raquo;?
              Цю дію неможливо скасувати. Всі дані мітингу будуть видалені.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDeleteMeeting(null)}>Скасувати</button>
              <button className="btn" onClick={handleDelete}
                style={{ background: 'color-mix(in oklab, var(--red) 22%, var(--surface))', color: '#fca5a5', borderColor: 'color-mix(in oklab, var(--red) 40%, var(--border))' }}>
                <Trash2 size={14} /> Видалити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Edit Meeting Modal ─────────────────────── */

function EditMeetingModal({ meeting, onClose, onSave }: {
  meeting: Meeting;
  onClose: () => void;
  onSave: (m: Meeting) => void;
}) {
  const schedAt = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const [title, setTitle] = useState(meeting.title);
  const [description, setDescription] = useState(meeting.description || '');
  const [date, setDate] = useState(schedAt ? schedAt.toISOString().slice(0, 10) : '');
  const [time, setTime] = useState(schedAt ? schedAt.toTimeString().slice(0, 5) : '14:00');
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
      const scheduledAt = date && time ? new Date(`${date}T${time}:00`).toISOString() : null;
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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      overflowY: 'auto',
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 560, width: '100%', padding: '24px 22px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Редагувати мітинг</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Назва</label>
            <input className="field" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Опис</label>
            <textarea className="field" rows={2} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Опис, агенда..." style={{ resize: 'none' }} />
          </div>
          {/* Agenda */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="field-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <ListChecks size={11} /> Питання ({agenda.length})
              </label>
              <button type="button" onClick={generateAgenda}
                disabled={aiAgendaLoading || title.trim().length < 3}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                  borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                  background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
                  color: title.trim().length < 3 ? 'var(--muted)' : 'var(--accent)',
                  cursor: aiAgendaLoading || title.trim().length < 3 ? 'not-allowed' : 'pointer',
                  opacity: title.trim().length < 3 ? 0.5 : 1,
                }}>
                {aiAgendaLoading ? <Loader2Icon size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={11} />}
                AI
              </button>
            </div>
            {agenda.map((item, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                padding: '5px 8px', background: 'var(--surface)', borderRadius: 6,
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, minWidth: 14, textAlign: 'center' }}>{idx + 1}</span>
                <input value={item} onChange={e => setAgenda(prev => prev.map((x, i) => i === idx ? e.target.value : x))}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12.5, color: 'var(--text)', padding: 0 }} />
                <button type="button" onClick={() => setAgenda(prev => prev.filter((_, i) => i !== idx))}
                  style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent',
                    color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <X size={10} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input className="field" placeholder="Додати питання..." value={newAgendaItem}
                onChange={e => setNewAgendaItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newAgendaItem.trim()) { setAgenda(p => [...p, newAgendaItem.trim()]); setNewAgendaItem(''); } } }}
                style={{ flex: 1, fontSize: 12, padding: '6px 10px' }} />
              <button type="button" className="btn btn-sm" onClick={() => { if (newAgendaItem.trim()) { setAgenda(p => [...p, newAgendaItem.trim()]); setNewAgendaItem(''); } }}
                disabled={!newAgendaItem.trim()} style={{ flexShrink: 0 }}>
                <Plus size={12} />
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <label className="field-label"><CalendarIcon size={11} /> Дата</label>
              <input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ minWidth: 0 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="field-label">Час</label>
              <input className="field" type="time" value={time} onChange={e => setTime(e.target.value)} style={{ minWidth: 0 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="field-label">Тривалість</label>
              <Select value={String(duration)} onChange={(v) => setDuration(parseInt(v))} style={{ minWidth: 0 }}
                options={[15, 30, 45, 60, 90, 120].map(d => ({ value: String(d), label: `${d} хв` }))} />
            </div>
          </div>

          {/* Participants */}
          <div>
            <label className="field-label"><Users size={11} /> Учасники ({selectedUsers.length + 1})</label>

            {/* Host */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
              background: 'var(--surface)', borderRadius: 8, marginBottom: 6, marginTop: 6,
            }}>
              <Avatar name={meeting.createdBy.name || 'U'} image={meeting.createdBy.image} size="sm" />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{meeting.createdBy.name}</div>
              <span className="chip" style={{ fontSize: 10 }}>Організатор</span>
            </div>

            {selectedUsers.map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                background: 'var(--surface)', borderRadius: 8, marginBottom: 4,
              }}>
                <Avatar name={u.name || 'U'} image={u.image} size="sm" />
                <div style={{ flex: 1, fontSize: 13 }}>{u.name}</div>
                <button className="btn btn-ghost btn-icon" style={{ width: 24, height: 24 }}
                  onClick={() => setSelectedUsers(p => p.filter(x => x.id !== u.id))}>
                  <X size={11} />
                </button>
              </div>
            ))}

            <div ref={searchRef} style={{ position: 'relative', marginTop: 6 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input className="field" placeholder="Додати учасника..."
                  value={userSearch} onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  style={{ paddingLeft: 30, fontSize: 13 }} />
              </div>
              {showDropdown && filteredUsers.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 10, maxHeight: 180, overflowY: 'auto', zIndex: 60,
                  boxShadow: '0 8px 24px rgba(0,0,0,.3)',
                }}>
                  {filteredUsers.slice(0, 6).map(u => (
                    <button key={u.id} onClick={() => { setSelectedUsers(p => [...p, u]); setUserSearch(''); setShowDropdown(false); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', background: 'transparent', border: 'none',
                        cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Avatar name={u.name || 'U'} image={u.image} size="sm" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim()}>
            <Save size={14} /> {saving ? 'Зберігання...' : 'Зберегти'}
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
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-ghost btn-icon" style={{ width: 30, height: 30 }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(isOpen ? null : meetingId); }}>
        <MoreHorizontal size={15} />
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 10, minWidth: 160, overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,.3)',
        }}>
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(null); onEdit(); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: 'transparent', border: 'none',
              cursor: 'pointer', color: 'var(--text)', fontSize: 13, textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Pencil size={13} /> Редагувати
          </button>
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(null); onDelete(); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: 'transparent', border: 'none',
              cursor: 'pointer', color: '#fca5a5', fontSize: 13, textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in oklab, var(--red) 10%, transparent)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Trash2 size={13} /> Видалити
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Shared components ─────────────────────────── */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: '-0.005em' }}>{title}</h2>
        {right && (typeof right === 'string' ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{right}</span> : right)}
      </div>
      {children}
    </section>
  );
}

function MeetingRow({ meeting, users, menuOpen, setMenuOpen, onEdit, onDelete }: {
  meeting: Meeting;
  users: { name: string; image: string | null }[];
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const start = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  return (
    <div
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 14px',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 12,
        transition: 'all .15s',
        color: 'inherit',
      }}
    >
      <div style={{ width: 46, textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
          {start ? fmtTime(start) : '--:--'}
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
          {meeting.durationMin}хв
        </div>
      </div>
      <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
      <Link href={`/lobby/${meeting.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meeting.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 12 }}>
          <span>{users.length} учасн.</span>
        </div>
      </Link>
      <AvatarStack users={users} max={3} />
      <Link href={`/lobby/${meeting.id}`} className="btn btn-sm btn-primary" style={{ textDecoration: 'none', flexShrink: 0 }}>
        <Video size={13} />
      </Link>
      {meeting.status !== 'ended' && (
        <MeetingMenu meetingId={meeting.id} menuOpen={menuOpen} setMenuOpen={setMenuOpen}
          onEdit={onEdit} onDelete={onDelete} />
      )}
    </div>
  );
}

function MeetingCard({ meeting, users, menuOpen, setMenuOpen, onEdit, onDelete }: {
  meeting: Meeting;
  users: { name: string; image: string | null }[];
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const start = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const end = start ? new Date(start.getTime() + meeting.durationMin * 60000) : null;

  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="mono" style={{ color: 'var(--muted)', fontSize: 11.5 }}>
              {start ? `${fmtTime(start)}–${end ? fmtTime(end) : ''}` : ''}
            </span>
            {meeting.recurrence && (
              <span className="chip">
                <RefreshCw size={11} /> Щотижня
              </span>
            )}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{meeting.title}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {start ? fmtRelative(start) : ''} &bull; {meeting.durationMin} хв
          </div>
        </div>
        {meeting.status !== 'ended' && (
          <MeetingMenu meetingId={meeting.id} menuOpen={menuOpen} setMenuOpen={setMenuOpen}
            onEdit={onEdit} onDelete={onDelete} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <AvatarStack users={users} max={5} />
        <Link href={`/lobby/${meeting.id}`} className="btn btn-sm btn-primary" style={{ textDecoration: 'none' }}>
          <Video size={13} /> Приєднатися
        </Link>
      </div>
    </div>
  );
}
