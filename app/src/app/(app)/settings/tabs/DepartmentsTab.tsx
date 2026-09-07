'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Plus, Pencil, Check, X, Trash2, Loader2, Crown, Building2, ChevronDown, ChevronRight, Users as UsersIcon, ListChecks, AlertTriangle,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import s from './DepartmentsTab.module.css';

interface DeptMember { userId: string; isLead: boolean; name: string | null; email: string | null; image?: string | null }
interface Dept { id: string; name: string; color: string | null; teableBaseId: string | null; clickupListId?: string | null; taskCount: number; meetingCount: number; members: DeptMember[] }
interface UserOpt { id: string; name: string; email: string; image?: string | null }
interface ListOpt { listId: string; label: string }

const COLORS = ['var(--accent)', '#8b5cf6', '#06b6d4', 'var(--success)', 'var(--warn)', 'var(--danger)', 'var(--pink)', '#64748b'];

export function DepartmentsTab() {
  const t = useTranslations();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [lists, setLists] = useState<ListOpt[]>([]);
  const [clickupOn, setClickupOn] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/departments');
      const d = r.ok ? await r.json() : [];
      setDepts(Array.isArray(d) ? d : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/users').then((r) => (r.ok ? r.json() : [])).then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => {});
  }, []);
  // The ClickUp lists for the picker: one fetch for the whole tab, never per row — it
  // walks Spaces → Folders → Lists upstream. Only when the integration is actually on.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await fetch('/api/settings/clickup').then((r) => (r.ok ? r.json() : null));
        if (!alive || !s?.enabled || !s?.tokenSet) return;
        setClickupOn(true);
        const d = await fetch('/api/settings/clickup/lists').then((r) => (r.ok ? r.json() : null));
        if (alive && Array.isArray(d?.lists)) setLists(d.lists);
      } catch { /* the picker just stays hidden */ }
    })();
    return () => { alive = false; };
  }, []);

  const setList = async (d: Dept, listId: string) => {
    const prev = d.clickupListId ?? null;
    const next = listId || null;
    setDepts((ds) => ds.map((x) => (x.id === d.id ? { ...x, clickupListId: next } : x)));
    try {
      const res = await fetch(`/api/departments/${d.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clickupListId: next }),
      });
      if (!res.ok) setDepts((ds) => ds.map((x) => (x.id === d.id ? { ...x, clickupListId: prev } : x)));
    } catch {
      setDepts((ds) => ds.map((x) => (x.id === d.id ? { ...x, clickupListId: prev } : x)));
    }
  };

  const createDept = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch('/api/departments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (r.ok) { setNewName(''); setNewColor(COLORS[0]); setCreating(false); await load(); }
    } finally { setBusy(false); }
  };

  const renameDept = async (d: Dept) => {
    const name = editVal.trim();
    setEditId(null);
    if (!name || name === d.name) return;
    setDepts((ds) => ds.map((x) => (x.id === d.id ? { ...x, name } : x)));
    await fetch(`/api/departments/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    }).catch(() => {});
  };

  const setColor = async (d: Dept, color: string) => {
    setDepts((ds) => ds.map((x) => (x.id === d.id ? { ...x, color } : x)));
    await fetch(`/api/departments/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color }),
    }).catch(() => {});
  };

  const deleteDept = async (d: Dept) => {
    if (!window.confirm(t('departments.deleteConfirm', { name: d.name }))) return;
    setDepts((ds) => ds.filter((x) => x.id !== d.id));
    await fetch(`/api/departments/${d.id}`, { method: 'DELETE' }).catch(() => {});
  };

  const addMember = async (d: Dept, userId: string) => {
    if (!userId) return;
    await fetch(`/api/departments/${d.id}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
    }).catch(() => {});
    await load();
  };

  const removeMember = async (d: Dept, userId: string) => {
    setDepts((ds) => ds.map((x) => (x.id === d.id ? { ...x, members: x.members.filter((m) => m.userId !== userId) } : x)));
    await fetch(`/api/departments/${d.id}/members?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }).catch(() => {});
  };

  const toggleLead = async (d: Dept, m: DeptMember) => {
    setDepts((ds) => ds.map((x) => (x.id === d.id ? { ...x, members: x.members.map((mm) => (mm.userId === m.userId ? { ...mm, isLead: !mm.isLead } : mm)) } : x)));
    await fetch(`/api/departments/${d.id}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: m.userId, isLead: !m.isLead }),
    }).catch(() => {});
  };

  const countChip = (icon: React.ReactNode, n: number, label: string) => (
    <span className={s.chipRow}>
      {icon}<b className={s.chipCount}>{n}</b> <span className={s.chipLabel}>{label}</span>
    </span>
  );

  return (
    <div className={s.wrap}>
      <div className={s.headerRow}>
        <div className={s.headerTitleWrap}>
          <div className={s.headerTitle}>{t('settings.tabDepartments')}</div>
          <div className={s.headerSubtitle}>{t('departments.subtitle')}</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setCreating((c) => !c); setNewName(''); }}>
          <Plus size={14} /> {t('departments.add')}
        </button>
      </div>

      {creating && (
        <div className={`card ${s.createCard}`}>
          <input
            className="field" autoFocus value={newName} placeholder={t('departments.namePlaceholder')}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createDept(); if (e.key === 'Escape') setCreating(false); }}
          />
          <div className={s.colorRow}>
            <span className={s.colorLabel}>{t('departments.color')}</span>
            {COLORS.map((c) => (
              <button key={c} onClick={() => setNewColor(c)} aria-label={c} className={s.swatch} style={{
                background: c,
                border: newColor === c ? '2px solid var(--text)' : '2px solid transparent',
              }} />
            ))}
          </div>
          <div className={s.createActions}>
            <button className="btn btn-sm" onClick={() => setCreating(false)}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm" onClick={createDept} disabled={busy || !newName.trim()}>
              {busy ? <Loader2 size={13} className={s.spinIcon} /> : <Check size={13} />} {t('departments.create')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        // Departments arrive as a list of cards, so the wait shows that shape rather
        // than a spinner: nothing jumps when the data lands, and the page already
        // reads as "a list, loading" instead of "something, somewhere".
        <div className={s.skeletonWrap} role="status" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`card ${s.skeletonCard}`}>
              <Skeleton w={30} h={30} radius={9} style={{ flexShrink: 0 }} />
              <span className={s.skeletonTextWrap}>
                <Skeleton w="34%" h={13} />
                <Skeleton w="18%" h={10} />
              </span>
            </div>
          ))}
        </div>
      ) : depts.length === 0 ? (
        <div className={`card ${s.emptyCard}`}>
          <Building2 size={28} className={s.emptyIcon} />
          <div className={s.emptyTitle}>{t('departments.empty')}</div>
          <div className={s.emptyHint}>{t('departments.emptyHint')}</div>
        </div>
      ) : (
        <div className={s.listWrap}>
          {depts.map((d) => {
            const isOpen = expanded === d.id;
            const dot = d.color || 'var(--accent)';
            const nonMembers = users.filter((u) => !d.members.some((m) => m.userId === u.id));
            return (
              <div key={d.id} className={`card ${s.deptCard}`}>
                <div className={s.deptHeader}>
                  <button className={`btn btn-ghost btn-icon ${s.toggleBtn}`}
                    onClick={() => setExpanded(isOpen ? null : d.id)} aria-label="toggle">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <span className={s.dot} style={{ background: dot }} />
                  <div className={s.nameWrap}>
                    {editId === d.id ? (
                      <div className={s.editRow}>
                        <input className={`field ${s.editInput}`} autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') renameDept(d); if (e.key === 'Escape') setEditId(null); }} />
                        <button className={`btn btn-ghost btn-icon ${s.iconBtn26}`} title={t('common.save')} onClick={() => renameDept(d)}><Check size={14} /></button>
                        <button className={`btn btn-ghost btn-icon ${s.iconBtn26}`} title={t('common.cancel')} onClick={() => setEditId(null)}><X size={14} /></button>
                      </div>
                    ) : (
                      <div className={s.nameRow}>
                        <span className={s.nameText}>{d.name}</span>
                        <button className={`btn btn-ghost btn-icon ${s.editIconBtn}`} title={t('common.edit')}
                          onClick={() => { setEditId(d.id); setEditVal(d.name); }}><Pencil size={13} /></button>
                      </div>
                    )}
                  </div>
                  <div className={s.statsRow}>
                    {clickupOn && !d.clickupListId && (
                      <span className={`chip ${s.warnChip}`} title={t('departments.clickupUnmappedHint')}>
                        <AlertTriangle size={10} /> {t('departments.clickupUnmapped')}
                      </span>
                    )}
                    {countChip(<UsersIcon size={13} className={s.iconMuted} />, d.members.length, t('departments.members'))}
                    {countChip(<ListChecks size={13} className={s.iconMuted} />, d.taskCount, t('departments.tasks'))}
                    <button className={`btn btn-ghost btn-icon ${s.deleteBtn}`} title={t('common.delete')} onClick={() => deleteDept(d)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className={s.panel}>
                    {/* color */}
                    <div className={s.panelColorRow}>
                      <span className={s.colorLabel}>{t('departments.color')}</span>
                      {COLORS.map((c) => (
                        <button key={c} onClick={() => setColor(d, c)} aria-label={c} className={s.swatchSm} style={{
                          background: c,
                          border: (d.color || COLORS[0]) === c ? '2px solid var(--text)' : '2px solid transparent',
                        }} />
                      ))}
                    </div>

                    {/* ClickUp destination list */}
                    {clickupOn && (
                      <div className={s.clickupBlock}>
                        <div className={s.sectionLabel}>
                          {t('departments.clickupList')}
                        </div>
                        <div className={s.selectMax380}>
                          <Select
                            value={d.clickupListId ?? ''}
                            placeholder={t('departments.clickupPick')}
                            options={[
                              { value: '', label: t('departments.clickupNoList') },
                              ...lists.map((l) => ({ value: l.listId, label: l.label })),
                            ]}
                            onChange={(v) => setList(d, v)}
                            style={{ height: 34, fontSize: 13 }}
                          />
                        </div>
                        <div className={s.hintText}>
                          {t('departments.clickupListHint')}
                        </div>
                      </div>
                    )}

                    {/* members */}
                    <div className={s.sectionLabel}>
                      {t('departments.members')}
                    </div>
                    {d.members.length === 0 ? (
                      <div className={s.noMembersText}>{t('departments.noMembers')}</div>
                    ) : (
                      <div className={s.membersList}>
                        {d.members.map((m) => (
                          <div key={m.userId} className={s.memberRow}>
                            <Avatar name={m.name || m.email || '?'} image={m.image} size="sm" />
                            <div className={s.memberInfo}>
                              <div className={s.memberNameRow}>
                                <span className={s.memberNameText}>{m.name || m.email}</span>
                                {m.isLead && <span className={`chip ${s.warnChip}`}><Crown size={10} /> {t('departments.lead')}</span>}
                              </div>
                            </div>
                            <button className={`btn btn-ghost btn-icon ${s.iconBtn28}`} style={{ color: m.isLead ? 'var(--amber)' : 'var(--muted)' }}
                              title={m.isLead ? t('departments.removeLead') : t('departments.makeLead')} onClick={() => toggleLead(d, m)}>
                              <Crown size={14} />
                            </button>
                            <button className={`btn btn-ghost btn-icon ${s.removeBtn}`}
                              title={t('departments.removeMember')} onClick={() => removeMember(d, m.userId)}>
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {nonMembers.length > 0 && (
                      <div className={s.addMemberWrap}>
                        <Select
                          value=""
                          placeholder={t('departments.addMember')}
                          options={nonMembers.map((u) => ({ value: u.id, label: u.name || u.email }))}
                          onChange={(uid) => addMember(d, uid)}
                          style={{ height: 34, fontSize: 13 }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
