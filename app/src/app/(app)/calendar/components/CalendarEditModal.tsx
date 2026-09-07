'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import {
  X,
  Plus,
  Calendar,
  Users as UsersIcon,
  Loader2,
  Save,
  Search,
  Wand2,
  ListChecks as ListChecksIcon,
} from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import type { Meeting, WsUser } from '../lib/types';
import s from './CalendarEditModal.module.css';

/* ------------------------------------------------------------------ */
/*  CalendarEditModal                                                 */
/* ------------------------------------------------------------------ */

export function CalendarEditModal({ meeting, onClose, onSave }: {
  meeting: Meeting;
  onClose: () => void;
  onSave: (m: Meeting) => void;
}) {
  const t = useTranslations();
  const schedAt = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const [title, setTitle] = useState(meeting.title);
  const [description, setDescription] = useState(meeting.description || '');
  const [date, setDate] = useState(schedAt ? schedAt.toISOString().slice(0, 10) : '');
  const [time, setTime] = useState(schedAt ? schedAt.toTimeString().slice(0, 5) : '14:00');
  const [duration, setDuration] = useState(meeting.durationMin);
  const [saving, setSaving] = useState(false);
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<string[]>(Array.isArray(meeting.agenda) ? meeting.agenda : []);
  const [newAgendaItem, setNewAgendaItem] = useState('');
  const [aiAgendaLoading, setAiAgendaLoading] = useState(false);

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
        const participantUserIds = meeting.participants
          .filter((p: any) => p.role !== 'host' && p.user)
          .map((p: any) => p.user!.id);
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

  const hostId = meeting.createdBy?.id;
  const filteredUsers = allUsers.filter(u => {
    if (u.id === hostId) return false;
    if (selectedUsers.some(s => s.id === u.id)) return false;
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  });

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

  const save = async () => {
    // This used to `return` on an empty title: Save did nothing and said nothing,
    // which reads as a broken button rather than a missing field.
    setTitleErr(null);
    if (!title.trim()) { setTitleErr(t('meetingForm.titleRequired')); return; }
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
          agenda: agenda.length > 0 ? agenda : null,
          participants: selectedUsers.map(u => ({ userId: u.id })),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onSave(updated);
      } else {
        const d = await res.json().catch(() => ({}));
        setTitleErr(d.error || t('meetingForm.saveFailed'));
      }
    } catch {
      setTitleErr(t('meetingForm.saveFailed'));
    }
    finally { setSaving(false); }
  };

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={`card ${s.modal}`}
        onClick={e => e.stopPropagation()}>
        <div className={s.headerRow}>
          <div className={s.title}>{t('calendar.editMeeting')}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div className={s.formCol}>
          <Field label={t('meetingForm.title')} error={titleErr} required>
            {(f) => (
              <input {...f} className="field" value={title}
                onChange={e => { setTitle(e.target.value); setTitleErr(null); }} />
            )}
          </Field>
          <div>
            <label className="field-label">{t('meetingForm.description')}</label>
            <textarea className={`field ${s.textareaNoResize}`} rows={2} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('meetingForm.descriptionPlaceholder')} />
          </div>

          {/* Agenda */}
          <div>
            <div className={s.agendaHeaderRow}>
              <label className={`field-label ${s.agendaLabel}`}>
                <ListChecksIcon size={11} /> {t('calendar.agendaCount', { count: agenda.length })}
              </label>
              <button type="button" onClick={generateAgenda}
                disabled={aiAgendaLoading || title.trim().length < 3}
                className={s.aiAgendaBtn}
                style={{
                  color: title.trim().length < 3 ? 'var(--muted)' : 'var(--accent)',
                  cursor: aiAgendaLoading || title.trim().length < 3 ? 'not-allowed' : 'pointer',
                  opacity: title.trim().length < 3 ? 0.5 : 1,
                }}>
                {aiAgendaLoading ? <Loader2 size={11} className={s.spin} /> : <Wand2 size={11} />}
                AI
              </button>
            </div>
            {agenda.map((item, idx) => (
              <div key={idx} className={s.agendaItem}>
                <span className={s.agendaIndex}>{idx + 1}</span>
                <input value={item} onChange={e => setAgenda(prev => prev.map((x, i) => i === idx ? e.target.value : x))}
                  className={s.agendaItemInput} />
                <button type="button" onClick={() => setAgenda(prev => prev.filter((_, i) => i !== idx))}
                  className={s.agendaRemoveBtn}>
                  <X size={10} />
                </button>
              </div>
            ))}
            <div className={s.addItemRow}>
              <input className={`field ${s.addItemInput}`} placeholder={t('meetingForm.addAgendaItem')} value={newAgendaItem}
                onChange={e => setNewAgendaItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newAgendaItem.trim()) { setAgenda(p => [...p, newAgendaItem.trim()]); setNewAgendaItem(''); } } }} />
              <button type="button" className={`btn btn-sm ${s.addItemBtn}`} onClick={() => { if (newAgendaItem.trim()) { setAgenda(p => [...p, newAgendaItem.trim()]); setNewAgendaItem(''); } }}
                disabled={!newAgendaItem.trim()}>
                <Plus size={12} />
              </button>
            </div>
          </div>

          <div className={s.gridThree}>
            <div className={s.minW0}>
              <label className="field-label"><Calendar size={11} /> {t('meetingForm.date')}</label>
              <input className={`field ${s.minW0}`} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className={s.minW0}>
              <label className="field-label">{t('meetingForm.time')}</label>
              <input className={`field ${s.minW0}`} type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div className={s.minW0}>
              <label className="field-label">{t('meetingForm.duration')}</label>
              <Select value={String(duration)} onChange={(v) => setDuration(parseInt(v))} style={{ minWidth: 0 }}
                options={[15, 30, 45, 60, 90, 120].map(d => ({ value: String(d), label: t('common.minutes', { count: d }) }))} />
            </div>
          </div>

          {/* Participants */}
          <div>
            <label className="field-label"><UsersIcon size={11} /> {t('calendar.participantsCount', { count: selectedUsers.length + 1 })}</label>
            {meeting.createdBy && (
              <div className={s.participantRow}>
                <Avatar name={meeting.createdBy.name || 'U'} image={meeting.createdBy.image} size="sm" />
                <div className={s.participantName}>{meeting.createdBy.name}</div>
                <span className={`chip ${s.organizerChip}`}>{t('calendar.organizer')}</span>
              </div>
            )}

            {selectedUsers.map(u => (
              <div key={u.id} className={s.selectedUserRow}>
                <Avatar name={u.name || 'U'} image={u.image} size="sm" />
                <div className={s.participantNameSm}>{u.name}</div>
                <button className={`btn btn-ghost btn-icon ${s.removeBtn24}`}
                  onClick={() => setSelectedUsers(p => p.filter(x => x.id !== u.id))}>
                  <X size={11} />
                </button>
              </div>
            ))}

            <div ref={searchRef} className={s.searchWrap}>
              <div className={s.searchInner}>
                <Search size={13} className={s.searchIcon} />
                <input className={`field ${s.searchInput}`} placeholder={t('meetingForm.addParticipant')}
                  value={userSearch} onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)} />
              </div>
              {showDropdown && filteredUsers.length > 0 && (
                <div className={s.dropdown}>
                  {filteredUsers.slice(0, 6).map(u => (
                    <button key={u.id} onClick={() => { setSelectedUsers(p => [...p, u]); setUserSearch(''); setShowDropdown(false); }}
                      className={s.dropdownItem}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Avatar name={u.name || 'U'} image={u.image} size="sm" />
                      <div>
                        <div className={s.dropdownItemName}>{u.name}</div>
                        <div className={s.dropdownItemEmail}>{u.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={s.footerRow}>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim()}>
            <Save size={14} /> {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
