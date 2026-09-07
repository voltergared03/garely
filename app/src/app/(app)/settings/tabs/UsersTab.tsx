'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Languages, Check, Search, Plus, Mail, Key, Loader2, Trash2, X, Copy, Pencil, Lock, LockOpen,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { useSession } from 'next-auth/react';
import { FieldWrapper } from '../components/shared';
import { useSaveErrorToast } from '@/components/save-toast';
import { Field } from '@/components/ui/field';
import { isValidEmail, passwordProblem } from '@/lib/form-rules';
import { getUserStatus } from '../lib/user-status';
import s from './UsersTab.module.css';

interface UserRecord {
  id: string; name: string; email: string; image?: string | null;
  role: 'admin' | 'member' | 'viewer'; status?: string; lastLogin?: string | null; createdAt?: string;
  hasPassword?: boolean;
  spokenLanguage?: string | null;
  spokenLanguageLocked?: boolean;
  clickupListId?: string | null;
}

interface ListOpt { listId: string; label: string }

export function UsersTab() {
  const t = useTranslations();
  // Optimistic updates all over this tab: the row changes first and the PATCH follows.
  // A rejected save used to be announced with a modal dialog, which cannot say which
  // row it belongs to, blocks the page, and is missed entirely by anyone who has
  // already scrolled on. The toast names the failure next to the work.
  const { showSaveError, saveToast } = useSaveErrorToast();
  const { data: session } = useSession();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [lists, setLists] = useState<ListOpt[]>([]);
  const [clickupOn, setClickupOn] = useState(false);
  const [editNameId, setEditNameId] = useState<string | null>(null);
  const [editNameVal, setEditNameVal] = useState('');
  const saveName = async (u: UserRecord) => {
    const n = editNameVal.trim();
    if (!n || n === u.name) { setEditNameId(null); return; }
    const prev = u.name;
    setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, name: n } : x)));
    setEditNameId(null);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, name: prev } : x)));
        showSaveError(err.error || t('settings.changeRoleFailed'));
      }
    } catch {
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, name: prev } : x)));
      showSaveError(t('settings.networkError'));
    }
  };
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [blockingId, setBlockingId] = useState<string | null>(null);

  // Blocking is the gentler neighbour of deleting: access stops, everything the person
  // is part of stays. Deleting suppresses their address and strips them out of the
  // meetings they were invited to — right for somebody who left, wrong for somebody on
  // leave or on notice, which until now was the only tool available.
  const setBlocked = async (u: UserRecord, blocked: boolean) => {
    const next = blocked ? 'disabled' : 'active';
    setBlockingId(u.id);
    const prev = u.status;
    setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, status: next } : x)));
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, status: prev } : x)));
        showSaveError(err.error || t('settings.error'));
      }
    } catch {
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, status: prev } : x)));
      showSaveError(t('settings.networkError'));
    } finally {
      setBlockingId(null);
    }
  };
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteEmailErr, setInviteEmailErr] = useState<string | null>(null);
  const [invitePwErr, setInvitePwErr] = useState<string | null>(null);

  // Admin password reset for an existing user.
  const [resetUser, setResetUser] = useState<UserRecord | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ password: string; emailed: boolean } | null>(null);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const openReset = (u: UserRecord) => {
    setResetUser(u); setResetResult(null); setResetErr(null); setCopied(false);
  };
  const doReset = async () => {
    if (!resetUser) return;
    setResetting(true); setResetErr(null);
    try {
      const res = await fetch(`/api/users/${resetUser.id}/password`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.password) {
        setResetResult({ password: d.password, emailed: !!d.emailed });
        setUsers((us) => us.map((x) => (x.id === resetUser.id ? { ...x, hasPassword: true } : x)));
      } else {
        setResetErr(d.error || t('settings.resetPasswordFailed'));
      }
    } catch { setResetErr(t('settings.networkError')); }
    finally { setResetting(false); }
  };

  const sendInvite = async () => {
    setInviteEmailErr(null); setInvitePwErr(null);
    // This used to `return` on an empty address — the button did nothing at all and
    // said nothing about why, which reads as the form being broken.
    if (!inviteEmail.trim()) { setInviteEmailErr(t('settings.emailRequired')); return; }
    // Same check the API runs, from lib/form-rules, so the browser cannot promise an
    // address the server will refuse (or refuse one it would have taken).
    if (!isValidEmail(inviteEmail)) { setInviteEmailErr(t('settings.emailInvalid')); return; }
    const withPassword = invitePassword.trim().length > 0;
    if (withPassword && passwordProblem(invitePassword)) {
      setInvitePwErr(t('settings.passwordMin8'));
      return;
    }
    setInviting(true); setInviteMsg(null);
    try {
      // With a temp password → create a credentials user (POST /api/users).
      // Without → send the Google-SSO invite as before.
      const res = withPassword
        ? await fetch('/api/users', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, password: invitePassword }),
          })
        : await fetch('/api/users/invite', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
          });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.user) {
        const created = withPassword ? { ...d.user, hasPassword: true } : d.user;
        setUsers((us) => {
          const exists = us.some((x) => x.id === created.id);
          return exists ? us.map((x) => (x.id === created.id ? { ...x, ...created } : x)) : [...us, created];
        });
        setInviteMsg({
          ok: true,
          text: withPassword
            ? (d.emailed ? t('settings.inviteCreatedEmailed') : t('settings.inviteCreatedManual'))
            : (d.emailSent ? t('settings.inviteSent') : t('settings.inviteAddedNoEmail')),
        });
        setInviteEmail(''); setInvitePassword('');
        setTimeout(() => { setInviteOpen(false); setInviteMsg(null); }, 1800);
      } else {
        setInviteMsg({ ok: false, text: d.error || t('settings.error') });
      }
    } catch { setInviteMsg({ ok: false, text: t('settings.networkError') }); }
    finally { setInviting(false); }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: UserRecord[]) => { if (!cancelled) setUsers(data); })
      .catch(() => {
        if (!cancelled && session?.user) {
          setUsers([{
            id: session.user.id ?? '1',
            name: session.user.name ?? t('settings.you'),
            email: session.user.email ?? '',
            image: session.user.image,
            role: 'admin', lastLogin: new Date().toISOString(),
          }]);
        }
      });
    return () => { cancelled = true; };
  }, [session]);

  // ClickUp lists for the per-user destination picker: one fetch for the tab (it walks
  // Spaces → Folders → Lists upstream), and only when the integration is actually on.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await fetch('/api/settings/clickup').then((r) => (r.ok ? r.json() : null));
        if (!alive || !s?.enabled || !s?.tokenSet) return;
        setClickupOn(true);
        const d = await fetch('/api/settings/clickup/lists').then((r) => (r.ok ? r.json() : null));
        if (alive && Array.isArray(d?.lists)) setLists(d.lists);
      } catch { /* the column just stays hidden */ }
    })();
    return () => { alive = false; };
  }, []);

  // Self-registration requests awaiting approval.
  const [requests, setRequests] = useState<{ id: string; email: string; name: string | null; createdAt: string; expiresAt: string }[]>([]);
  const [reqBusy, setReqBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/users/requests')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (Array.isArray(d)) setRequests(d); })
      .catch(() => {});
  }, []);

  const decideRequest = async (id: string, action: 'approve' | 'deny') => {
    setReqBusy(id);
    try {
      const res = await fetch('/api/users/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setRequests((rs) => rs.filter((r) => r.id !== id));
        if (action === 'approve' && d.user) {
          const created = { ...d.user, hasPassword: true };
          setUsers((us) => (us.some((x) => x.id === created.id) ? us : [...us, created]));
        }
      }
    } catch { /* ignore */ }
    finally { setReqBusy(null); }
  };

  const filtered = users.filter(
    (u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className={s.wrap}>
      <div className={s.toolbar}>
        <div className={`tasks-search ${s.searchWrap}`}>
          <Search size={14} className={s.searchIcon} />
          <input className={`field ${s.searchInput}`} placeholder={t('settings.searchUser')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className={`muted ${s.countText}`}>{t('settings.countOf', { shown: filtered.length, total: users.length })}</div>
        <button className="btn btn-primary" onClick={() => { setInviteOpen(true); setInviteMsg(null); }}><Plus size={14} /> {t('settings.add')}</button>
      </div>

      {requests.length > 0 && (
        <div className={`card ${s.requestsCard}`}>
          <div className={s.requestsTitle}>
            {t('settings.registrationRequests')}
            <span className={`chip ${s.requestsChip}`}>{requests.length}</span>
          </div>
          <div className={s.requestsList}>
            {requests.map((r) => {
              const daysLeft = Math.max(0, Math.ceil((new Date(r.expiresAt).getTime() - Date.now()) / 86400000));
              return (
                <div key={r.id} className={s.requestRow}>
                  <div className={s.requestName}>
                    <div className={s.requestNameText}>{r.name || r.email.split('@')[0]}</div>
                    <div className={`mono ${s.requestEmail}`}>{r.email}</div>
                  </div>
                  <span className={s.requestDays}>{t('settings.daysLeft', { count: daysLeft })}</span>
                  <button className={`btn btn-sm ${s.denyBtn}`} disabled={reqBusy === r.id} onClick={() => decideRequest(r.id, 'deny')}>{t('settings.deny')}</button>
                  <button className="btn btn-primary btn-sm" disabled={reqBusy === r.id} onClick={() => decideRequest(r.id, 'approve')}>
                    {reqBusy === r.id ? <Loader2 size={13} className="spin" /> : t('settings.approve')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`card ${s.tableCard}`}>
        <div className={s.tableScroll}>
        <div className={`admin-table-header${clickupOn ? ' has-clickup' : ''} ${s.tableHeader}`}>
          <div>{t('settings.colUser')}</div><div>{t('settings.colEmail')}</div><div>{t('settings.colRole')}</div><div>{t('settings.colLanguage')}</div>{clickupOn && <div>{t('settings.colClickup')}</div>}<div>{t('settings.colStatus')}</div><div />
        </div>
        {filtered.map((u) => {
          const isMe = session?.user?.email === u.email;
          const st = getUserStatus(u.lastLogin);
          return (
            <div key={u.id} className={`admin-table-row user-row${clickupOn ? ' has-clickup' : ''} ${s.row}${u.status === 'disabled' ? ` ${s.rowDisabled}` : ''}`}>
              <div className={s.userCell}>
                <span className={s.avatarWrap}>
                  <Avatar name={u.name} image={u.image} size="md" />
                  <span className={st.kind === 'online' ? 'av-presence av-online' : 'av-presence'} style={{ background: st.color }} />
                </span>
                <div className={s.minW0}>
                  {editNameId === u.id ? (
                    <div className={s.editNameRow}>
                      <input
                        className={`field ${s.editNameInput}`}
                        value={editNameVal}
                        autoFocus
                        onChange={(e) => setEditNameVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveName(u);
                          if (e.key === 'Escape') setEditNameId(null);
                        }}
                      />
                      <button className={`btn btn-ghost btn-icon ${s.iconBtn26}`} title={t('common.save')} onClick={() => saveName(u)}>
                        <Check size={14} />
                      </button>
                      <button className={`btn btn-ghost btn-icon ${s.iconBtn26}`} title={t('common.cancel')} onClick={() => setEditNameId(null)}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className={s.nameRow}>
                      <span className={s.nameText}>{u.name}</span>
                {u.status === 'disabled' && (
                  <span className={`chip ${s.blockedChip}`}>
                    {t('settings.blocked')}
                  </span>
                )}
                      {isMe && <span className="chip">{t('settings.itsYou')}</span>}
                      <button
                        className={`btn btn-ghost btn-icon ${s.editIconBtn}`}
                        title={t('settings.editName')}
                        onClick={() => { setEditNameId(u.id); setEditNameVal(u.name); }}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className={`mono ${s.emailCell}`}>{u.email}</div>
              <div className={s.minW0}>
                <Select
                  value={u.role}
                  options={[
                    { value: 'admin', label: t('settings.role_admin') },
                    { value: 'member', label: t('settings.role_member') },
                    { value: 'viewer', label: t('settings.role_viewer') },
                  ]}
                  className={s.selectSm}
                  onChange={async (newRole) => {
                    const prev = u.role;
                    setUsers((us) => us.map((x) => x.id === u.id ? { ...x, role: newRole as UserRecord['role'] } : x));
                    try {
                      const res = await fetch(`/api/users/${u.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role: newRole }),
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        showSaveError(err.error || t('settings.changeRoleFailed'));
                        setUsers((us) => us.map((x) => x.id === u.id ? { ...x, role: prev } : x));
                      }
                    } catch {
                      showSaveError(t('settings.networkError'));
                      setUsers((us) => us.map((x) => x.id === u.id ? { ...x, role: prev } : x));
                    }
                  }}
                />
              </div>
              <div className={s.minW0}>
                <Select
                  value={u.spokenLanguageLocked ? (u.spokenLanguage || '') : ''}
                  icon={<Languages size={13} className={s.langIcon} />}
                  options={[
                    { value: '', label: t('settings.spokenLanguageAuto') },
                    { value: 'uk', label: 'Українська' },
                    { value: 'en', label: 'English' },
                    { value: 'ru', label: 'Русский' },
                  ]}
                  className={s.selectSm}
                  onChange={async (v) => {
                    const prevLang = u.spokenLanguage; const prevLock = u.spokenLanguageLocked;
                    setUsers((us) => us.map((x) => x.id === u.id ? { ...x, spokenLanguage: v || x.spokenLanguage, spokenLanguageLocked: !!v } : x));
                    try {
                      const res = await fetch(`/api/users/${u.id}`, {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(v ? { spokenLanguage: v, spokenLanguageLocked: true } : { spokenLanguageLocked: false }),
                      });
                      if (!res.ok) {
                        setUsers((us) => us.map((x) => x.id === u.id ? { ...x, spokenLanguage: prevLang, spokenLanguageLocked: prevLock } : x));
                      }
                    } catch {
                      setUsers((us) => us.map((x) => x.id === u.id ? { ...x, spokenLanguage: prevLang, spokenLanguageLocked: prevLock } : x));
                    }
                  }}
                />
              </div>
              {clickupOn && (
                <div className={s.minW0} title={t('settings.clickupUserListHint')}>
                  <Select
                    value={u.clickupListId ?? ''}
                    options={[
                      { value: '', label: t('settings.clickupUserNoList') },
                      ...lists.map((l) => ({ value: l.listId, label: l.label })),
                    ]}
                    className={s.selectSm}
                    onChange={async (v) => {
                      const prev = u.clickupListId ?? null;
                      const next = v || null;
                      setUsers((us) => us.map((x) => x.id === u.id ? { ...x, clickupListId: next } : x));
                      try {
                        const res = await fetch(`/api/users/${u.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ clickupListId: next }),
                        });
                        if (!res.ok) setUsers((us) => us.map((x) => x.id === u.id ? { ...x, clickupListId: prev } : x));
                      } catch {
                        setUsers((us) => us.map((x) => x.id === u.id ? { ...x, clickupListId: prev } : x));
                      }
                    }}
                  />
                </div>
              )}
              <div>
                {(() => {
                  const label =
                    st.kind === 'never' ? t('settings.statusNeverLoggedIn')
                    : st.kind === 'online' ? t('settings.statusOnline')
                    : st.kind === 'minutes' ? t('settings.statusMinutesAgo', { count: st.value })
                    : st.kind === 'hours' ? t('settings.statusHoursAgo', { count: st.value })
                    : t('settings.statusDaysAgo', { count: st.value });
                  const online = st.kind === 'online';
                  return (
                    <span className={s.statusBadge} style={{
                      background: online ? 'color-mix(in oklab, var(--green) 13%, transparent)' : 'var(--surface-2)',
                      border: `1px solid ${online ? 'color-mix(in oklab, var(--green) 32%, transparent)' : 'var(--border)'}`,
                      color: online ? 'var(--green)' : 'var(--text-2)',
                    }}>
                      {online && <span className={s.onlineDot} />}
                      {label}
                    </span>
                  );
                })()}
              </div>
              <div className={`row-actions ${s.rowActions}`}>
                {!isMe && u.hasPassword && (
                  <button
                    className={`btn btn-ghost btn-icon ${s.iconBtn30}`}
                    title={t('settings.resetPassword')}
                    onClick={() => openReset(u)}
                  >
                    <Key size={14} />
                  </button>
                )}
                {!isMe && (
                  <button
                    className={`btn btn-ghost btn-icon ${s.iconBtn30}`}
                    title={u.status === 'disabled' ? t('settings.unblockUser') : t('settings.blockUser')}
                    disabled={blockingId === u.id}
                    onClick={() => {
                      // Unblocking needs no warning; blocking signs them out everywhere
                      // on their next request, which is worth saying out loud first.
                      if (u.status !== 'disabled' && !window.confirm(t('settings.blockUserConfirm', { name: u.name }))) return;
                      setBlocked(u, u.status !== 'disabled');
                    }}
                    style={{ color: u.status === 'disabled' ? 'var(--warn)' : 'var(--muted)' }}
                  >
                    {blockingId === u.id
                      ? <Loader2 size={14} className={s.spinIcon} />
                      : u.status === 'disabled' ? <LockOpen size={14} /> : <Lock size={14} />}
                  </button>
                )}
                {!isMe && (
                  <button
                    className={`btn btn-ghost btn-icon ${s.iconBtn30} ${s.redText}`}
                    title={t('settings.deleteUser')}
                    disabled={deletingId === u.id}
                    onClick={async () => {
                      if (!window.confirm(t('settings.deleteUserConfirm', { name: u.name, email: u.email }))) return;
                      setDeletingId(u.id);
                      try {
                        const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
                        if (res.ok) {
                          setUsers((us) => us.filter((x) => x.id !== u.id));
                        } else {
                          const err = await res.json().catch(() => ({}));
                          showSaveError(err.error || t('settings.deleteUserFailed'));
                        }
                      } catch {
                        showSaveError(t('settings.networkError'));
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                  >
                    {deletingId === u.id ? <Loader2 size={14} className={s.spinIcon} /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className={s.emptyState}>
            <Search size={26} className={s.emptyIcon} />
            <div className={s.emptyText}>{t('settings.noUsersFound')}</div>
          </div>
        )}
        </div>
      </div>

      {inviteOpen && (
        <div onClick={() => setInviteOpen(false)} className={s.modalOverlay}>
          <div onClick={(e) => e.stopPropagation()} className={`card ${s.modalCard}`}>
            <div className={s.modalTitle}>{t('settings.addUser')}</div>
            <div className={s.modalDesc}>{t('settings.addUserDesc')}</div>
            <Field label={t('settings.colEmail')} error={inviteEmailErr} required>
              {(f) => (
                <input {...f} className="field" type="email" value={inviteEmail} placeholder="user@example.com" autoFocus
                  onChange={(e) => { setInviteEmail(e.target.value); setInviteEmailErr(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendInvite(); }} />
              )}
            </Field>
            <div className={s.mt14}>
              <FieldWrapper label={t('settings.colRole')}>
                <Select value={inviteRole} onChange={setInviteRole} options={[
                  { value: 'member', label: t('settings.role_member') },
                  { value: 'admin', label: t('settings.role_admin') },
                  { value: 'viewer', label: t('settings.role_viewer') },
                ]} />
              </FieldWrapper>
            </div>
            <div className={s.mt14}>
              <Field
                label={t('settings.tempPasswordOptional')}
                hint={t('settings.tempPasswordHint')}
                error={invitePwErr}
              >
                {(f) => (
                  <input {...f} className="field" type="text" value={invitePassword} placeholder={t('settings.tempPasswordPlaceholder')}
                    onChange={(e) => { setInvitePassword(e.target.value); setInvitePwErr(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendInvite(); }} />
                )}
              </Field>
            </div>
            {inviteMsg && <div className={s.msgText} style={{ color: inviteMsg.ok ? 'var(--success-fg)' : 'var(--danger-fg)' }}>{inviteMsg.text}</div>}
            <div className={s.modalFooter}>
              <button className="btn btn-sm" onClick={() => setInviteOpen(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary btn-sm" onClick={sendInvite} disabled={inviting}>
                {inviting ? <Loader2 size={13} className={s.spinIcon} /> : <Mail size={13} />} {t('settings.send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetUser && (
        <div onClick={() => setResetUser(null)} className={s.modalOverlay}>
          <div onClick={(e) => e.stopPropagation()} className={`card ${s.modalCard}`}>
            <div className={s.modalTitle}>{t('settings.resetPassword')}</div>
            <div className={s.modalDesc}>{resetUser.name} · {resetUser.email}</div>
            {!resetResult ? (
              <>
                <div className={s.resetDesc}>
                  {t('settings.resetPasswordDesc')}
                </div>
                {resetErr && <div className={s.errorText}>{resetErr}</div>}
                <div className={s.modalFooter}>
                  <button className="btn btn-sm" onClick={() => setResetUser(null)}>{t('common.cancel')}</button>
                  <button className="btn btn-primary btn-sm" onClick={doReset} disabled={resetting}>
                    {resetting ? <Loader2 size={13} className={s.spinIcon} /> : <Key size={13} />} {t('settings.generate')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={s.label}>{t('settings.newTempPassword')}</div>
                <div className={s.pwRow}>
                  <code className={`mono ${s.pwCode}`}>{resetResult.password}</code>
                  <button className={`btn btn-sm ${s.flexShrink0}`} title={t('settings.copy')} onClick={() => { try { navigator.clipboard?.writeText(resetResult.password); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <div className={s.msgText} style={{ color: resetResult.emailed ? 'var(--green)' : 'var(--muted)' }}>
                  {resetResult.emailed ? t('settings.resetPasswordEmailed') : t('settings.resetPasswordManual')}
                </div>
                <div className={s.modalFooterBare}>
                  <button className="btn btn-primary btn-sm" onClick={() => setResetUser(null)}>{t('settings.done')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {saveToast}
    </div>
  );
}
