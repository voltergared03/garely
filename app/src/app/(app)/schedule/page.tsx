'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import { MeetingFlags } from '@/components/meeting-flags';
import { Select } from '@/components/ui/select';
import { useSession } from 'next-auth/react';
import {
  ChevronLeft, Calendar, Clock, Globe, RefreshCw, Building2,
  Users, Plus, Search, X, Send, AlertCircle,
  CheckCircle, Link2, Copy, Wand2, ListChecks, Loader2, Trash2, GripVertical,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useIsMobile } from '@/lib/use-is-mobile';
import s from './page.module.css';

interface WsUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
}

export default function SchedulePage() {
  const router = useRouter();
  const t = useTranslations();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const [created, setCreated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    date: new Date().toISOString().slice(0, 10),
    time: '14:00',
    duration: 30,
    timezone: 'Europe/Kyiv',
    recurring: 'none',
    description: '',
    transcription: true,
    aiReport: true,
    taskCreation: false,
    allowGuests: true,
    departmentId: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // The four switches used to be hard-coded `true`, which made the admin's meeting
  // policies dead for this form — the API only applies them to OMITTED fields, and
  // the form always sent all four. Seed them from the policy instead. Best-effort:
  // if the request fails the hard-coded values stand, exactly as before.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/meeting-defaults')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setForm((f) => ({
          ...f,
          transcription: !!d.transcription,
          aiReport: !!d.aiReport,
          taskCreation: !!d.taskCreation,
          allowGuests: !!d.allowGuests,
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  // Form-level: a rejected POST belongs to no single field, but it still has to be
  // said. It used to go to console.error alone — the spinner stopped and nothing
  // else changed, so a failed submit was indistinguishable from a dead button.
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [aiAgendaLoading, setAiAgendaLoading] = useState(false);
  const [createdId, setCreatedId] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  // Participants
  const [allUsers, setAllUsers] = useState<WsUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<WsUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAllUsers(data); })
      .catch(console.error);
    fetch('/api/departments')
      .then(r => (r.ok ? r.json() : []))
      .then(data => { if (Array.isArray(data)) setDepartments(data.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))); })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const currentUserId = session?.user?.id;
  const filteredUsers = allUsers.filter(u => {
    if (u.id === currentUserId) return false; // exclude self (already host)
    if (selectedUsers.some(s => s.id === u.id)) return false;
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  });

  const addUser = (u: WsUser) => {
    setSelectedUsers(prev => [...prev, u]);
    setUserSearch('');
    setShowUserDropdown(false);
  };

  const removeUser = (id: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== id));
  };

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const generateAgenda = async () => {
    if (aiAgendaLoading || form.title.trim().length < 3) return;
    setAiAgendaLoading(true);
    try {
      const res = await fetch('/api/meetings/ai-agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
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

  const addAgendaItem = () => {
    const item = newItem.trim();
    if (!item) return;
    setAgenda(prev => [...prev, item]);
    setNewItem('');
  };

  const removeAgendaItem = (idx: number) => {
    setAgenda(prev => prev.filter((_, i) => i !== idx));
  };

  const updateAgendaItem = (idx: number, val: string) => {
    setAgenda(prev => prev.map((item, i) => i === idx ? val : item));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = t('schedule.errorTitleRequired');
    if (form.title.length > 0 && form.title.length < 3) e.title = t('schedule.errorTitleTooShort');
    if (!form.date) e.date = t('schedule.errorDateRequired');
    if (!form.time) e.time = t('schedule.errorTimeRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitErr(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const scheduledAt = zonedWallTimeToUtcISO(form.date, form.time, form.timezone);
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          scheduledAt,
          durationMin: form.duration,
          recurrence: form.recurring !== 'none' ? { type: form.recurring } : null,
          transcriptionEnabled: form.transcription,
          aiReportEnabled: form.aiReport,
          taskCreationEnabled: form.taskCreation,
          allowGuests: form.allowGuests,
          departmentId: form.departmentId || null,
          participants: selectedUsers.map(u => ({ userId: u.id })),
          agenda: agenda.length > 0 ? agenda : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSubmitErr(d.error || t('schedule.createFailed'));
        return;
      }
      const meeting = await res.json();
      setCreatedId(meeting.id);
      setCreated(true);
    } catch (e) {
      console.error(e);
      setSubmitErr(t('schedule.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <div className={s.pageScroll}>
        <div className={s.successWrap}>
          <div className={`card fade-in ${s.successCard}`}>
            <div className={s.successIcon}>
              <CheckCircle size={32} className={s.greenIcon} />
            </div>
            <div className={s.successTitle}>{t('schedule.createdTitle')}</div>
            <div className={s.successSub}>
              &laquo;{form.title}&raquo; &mdash; {form.date}, {form.time}
              {selectedUsers.length > 0 && (
                <span> &bull; {t('common.participants', { count: selectedUsers.length })}</span>
              )}
            </div>
            <div className={s.successActions}>
              <button className="btn" onClick={() => router.push('/calendar')}>{t('schedule.toCalendar')}</button>
              <button className="btn btn-primary" onClick={() => router.push('/')}>{t('schedule.toDashboard')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.pageScroll}>
      <div className={`page-container ${s.container}`}>
        <div className={s.headerRow}>
          <button className="btn btn-ghost btn-icon" onClick={() => router.push('/')}>
            <ChevronLeft size={16} />
          </button>
          <h1 className={s.headerTitle}>{t('nav.newMeeting')}</h1>
        </div>

        <div className={s.formStack}>
          {/* Title */}
          <div className={`card ${s.cardPad}`}>
            {/* No visible label by design — the title IS the page heading here. Field
                still supplies the id/aria wiring so the error below is announced as
                belonging to this input rather than floating loose in the card. */}
            <Field error={errors.title}>
              {(f) => (
                <input
                  {...f}
                  className={`field ${s.titleInput}`}
                  aria-label={t('meetingForm.title')}
                  placeholder={t('schedule.titlePlaceholder')}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </Field>
            <textarea
              className={`field ${s.descInput}`}
              rows={2}
              placeholder={t('schedule.descriptionPlaceholder')}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          {/* Agenda checklist */}
          <div className={`card ${s.cardPad}`}>
            <div className={s.rowBetween}>
              <div className={s.rowGap8}>
                <ListChecks size={15} className={s.accentIcon} />
                <div className={s.sectionTitle}>{t('schedule.agendaHeading')}</div>
                {agenda.length > 0 && (
                  <span className={s.countBadge}>
                    {agenda.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={generateAgenda}
                disabled={aiAgendaLoading || form.title.trim().length < 3}
                className={s.genBtn}
                style={{
                  cursor: aiAgendaLoading || form.title.trim().length < 3 ? 'not-allowed' : 'pointer',
                  color: form.title.trim().length < 3 ? 'var(--muted)' : 'var(--accent)',
                  opacity: form.title.trim().length < 3 ? 0.5 : 1,
                }}
              >
                {aiAgendaLoading ? <Loader2 size={13} className={s.spinIcon} /> : <Wand2 size={13} />}
                {agenda.length > 0 ? t('schedule.regenerate') : t('schedule.generateAi')}
              </button>
            </div>

            {agenda.length > 0 && (
              <div className={s.agendaList}>
                {agenda.map((item, idx) => (
                  <div key={idx} className={s.agendaItem}>
                    <span className={s.agendaIndex}>
                      {idx + 1}
                    </span>
                    <input
                      value={item}
                      onChange={e => updateAgendaItem(idx, e.target.value)}
                      className={s.agendaInput}
                    />
                    <button type="button" onClick={() => removeAgendaItem(idx)}
                      className={s.agendaRemoveBtn}
                      onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklab, var(--red) 15%, transparent)'; e.currentTarget.style.color = '#fca5a5'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className={s.addItemRow}>
              <input
                className={`field ${s.agendaNewInput}`}
                placeholder={t('meetingForm.addAgendaItem')}
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAgendaItem(); } }}
              />
              <button type="button" className={`btn ${s.shrink0}`} onClick={addAgendaItem}
                disabled={!newItem.trim()}>
                <Plus size={14} /> {t('schedule.addItem')}
              </button>
            </div>

            {agenda.length === 0 && (
              <div className={s.emptyHint}>
                {t('schedule.agendaEmptyHint')}
              </div>
            )}
          </div>

          {/* Date / time / duration — each field on its own row on mobile (3 cols on desktop) */}
          <div className={`card schedule-grid-3 ${s.gridCard}`}>
            <Field label={t('meetingForm.date')} icon={Calendar} error={errors.date}>
              {(f) => <input {...f} className={`field ${s.textLeft}`} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />}
            </Field>
            <Field label={t('schedule.start')} icon={Clock} error={errors.time}>
              {(f) => <input {...f} className={`field ${s.textLeft}`} type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />}
            </Field>
            <Field label={t('meetingForm.duration')} error={errors.duration}>
              <Select value={String(form.duration)} onChange={(v) => set('duration', parseInt(v))}
                options={[15, 30, 45, 60, 90, 120].map((d) => ({ value: String(d), label: t('common.minutes', { count: d }) }))} />
            </Field>
            <Field label={t('schedule.timezone')} icon={Globe}>
              <Select value={form.timezone} onChange={(v) => set('timezone', v)} options={[
                { value: 'Europe/Kyiv', label: 'Europe/Kyiv' },
                { value: 'Europe/Warsaw', label: 'Europe/Warsaw' },
                { value: 'Europe/London', label: 'Europe/London' },
                { value: 'America/New_York', label: 'America/New_York' },
                { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
              ]} />
            </Field>
            <Field label={t('schedule.recurrence')} icon={RefreshCw}>
              <Select value={form.recurring} onChange={(v) => set('recurring', v)} options={[
                { value: 'none', label: t('schedule.recurrenceNone') },
                { value: 'daily', label: t('schedule.recurrenceDaily') },
                { value: 'weekly', label: t('schedule.recurrenceWeekly') },
                { value: 'biweekly', label: t('schedule.recurrenceBiweekly') },
                { value: 'monthly', label: t('schedule.recurrenceMonthly') },
              ]} />
            </Field>
            {departments.length > 0 && (
              <Field label={t('departments.label')} icon={Building2}>
                <Select value={form.departmentId} onChange={(v) => set('departmentId', v)} options={[
                  { value: '', label: t('departments.none') },
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]} />
              </Field>
            )}
          </div>

          {/* Participants */}
          <div className={`card ${s.cardPad}`}>
            <div className={s.rowGap8Mb14}>
              <Users size={15} className={s.accentIcon} />
              <div className={s.sectionTitle}>{t('meetingForm.participants')}</div>
              <span className={s.participantCount}>
                {t('schedule.participantsCountWithYou', { count: selectedUsers.length + 1 })}
              </span>
            </div>

            {/* Host (current user) */}
            <div className={s.hostRow}>
              <Avatar name={session?.user?.name || 'U'} image={session?.user?.image || null} size="sm" />
              <div className={s.flex1}>
                <div className={s.nameText}>{session?.user?.name || t('schedule.you')}</div>
                <div className={s.emailText}>{session?.user?.email}</div>
              </div>
              <span className={`chip ${s.hostBadge}`}>{t('common.host')}</span>
            </div>

            {/* Selected participants */}
            {selectedUsers.map(u => (
              <div key={u.id} className={s.participantRow}>
                <Avatar name={u.name || 'U'} image={u.image} size="sm" />
                <div className={s.flex1}>
                  <div className={s.nameText}>{u.name}</div>
                  <div className={s.emailText}>{u.email}</div>
                </div>
                <button className={`btn btn-ghost btn-icon ${s.removeBtnSm}`}
                  onClick={() => removeUser(u.id)}>
                  <X size={12} />
                </button>
              </div>
            ))}

            {/* User search */}
            <div ref={searchRef} className={s.searchWrap}>
              <div className={s.searchInputWrap}>
                <Search size={14} className={s.searchIcon} />
                <input
                  className={`field ${s.searchField}`}
                  placeholder={t('meetingForm.addParticipant')}
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
                  onFocus={() => setShowUserDropdown(true)}
                />
              </div>
              {showUserDropdown && filteredUsers.length > 0 && (
                <div className={s.dropdown} style={{ boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
                  {filteredUsers.slice(0, 8).map(u => (
                    <button key={u.id} onClick={() => addUser(u)}
                      className={s.dropdownItem}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Avatar name={u.name || 'U'} image={u.image} size="sm" />
                      <div>
                        <div className={s.nameText}>{u.name}</div>
                        <div className={s.emailText}>{u.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {showUserDropdown && userSearch && filteredUsers.length === 0 && (
                <div className={s.noResults} style={{ boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
                  {t('schedule.noUsersFound')}
                </div>
              )}
            </div>
          </div>

          {/* AI options */}
          <div className={`card ${s.cardPad}`}>
            <MeetingFlags
              value={{ transcription: form.transcription, aiReport: form.aiReport, taskCreation: form.taskCreation, allowGuests: form.allowGuests }}
              onChange={(f) => setForm((p) => ({ ...p, ...f }))}
            />
          </div>

          {submitErr && (
            <div className={s.endRow}>
              <Err msg={submitErr} />
            </div>
          )}
          <div className={s.submitRow} style={{ flexDirection: isMobile ? 'column' : 'row' }}>
            <button className="btn" onClick={() => router.push('/')}
              style={isMobile ? { width: '100%', justifyContent: 'center', padding: '13px' } : undefined}>{t('common.cancel')}</button>
            <button className={`btn btn-primary ${s.sendBtn}`} onClick={submit} disabled={loading}
              style={isMobile ? { width: '100%', justifyContent: 'center', padding: '14px' } : undefined}>
              <Send size={14} /> {loading ? t('schedule.creating') : t('schedule.submit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Convert a wall-clock date+time entered in `tz` (IANA) into a UTC ISO string.
function zonedWallTimeToUtcISO(dateStr: string, timeStr: string, tz: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const utcGuess = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts: Record<string, string> = {};
    for (const p of dtf.formatToParts(new Date(utcGuess))) parts[p.type] = p.value;
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    const offset = asUtc - utcGuess; // tz offset at that instant
    return new Date(utcGuess - offset).toISOString();
  } catch {
    return new Date(`${dateStr}T${timeStr}:00`).toISOString();
  }
}

function Err({ msg }: { msg: string }) {
  return (
    <div className={s.errMsg}>
      <AlertCircle size={12} /> {msg}
    </div>
  );
}
