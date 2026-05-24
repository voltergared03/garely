'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Globe, LogOut, Save, Check, Mic, Video as VideoIcon, Volume2,
  Users, Shield, ShieldAlert, Sparkles, Search, Plus,
  Video, Mail, Archive, Download, Settings as SettingsIcon,
  Key, Eye, EyeOff, Loader2, Trash2, X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { TwoFactorSecurity } from '@/components/twofa/security-card';
import { TwoFactorSetupFlow } from '@/components/twofa/setup-flow';
import { PushToggle } from '@/components/push-toggle';
import { useSession, signOut } from 'next-auth/react';

/* ── Shared UI ────────────────────────────────── */

function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: '1px solid var(--border)',
      cursor: disabled ? 'not-allowed' : 'pointer', gap: 14, opacity: disabled ? 0.55 : 1,
    }}>
      <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{label}</span>
      <button type="button" disabled={disabled} onClick={() => { if (!disabled) onChange(!value); }} style={{
        width: 38, height: 22, borderRadius: 999, border: 'none',
        background: value ? 'var(--accent)' : 'var(--surface-3)',
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.15s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 3, left: value ? 19 : 3,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        }} />
      </button>
    </label>
  );
}

function FieldWrapper({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="field-label">{label}</label>{children}</div>;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function UsageRow({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
        <span style={{ color: 'var(--text-2)' }}>{label}</span>
        <span className="mono" style={{ color: 'var(--muted)' }}>{value}</span>
      </div>
      <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
      </div>
    </div>
  );
}

/* ── Tabs definition ──────────────────────────── */

type TabKey = 'profile' | 'users' | 'workspace' | 'integrations' | 'billing';

interface TabDef { key: TabKey; label: string; icon: React.ReactNode; adminOnly: boolean }

const TABS: TabDef[] = [
  { key: 'profile', label: 'Профіль', icon: <SettingsIcon size={14} />, adminOnly: false },
  { key: 'users', label: 'Користувачі', icon: <Users size={14} />, adminOnly: true },
  { key: 'workspace', label: 'Workspace', icon: <Shield size={14} />, adminOnly: true },
  { key: 'integrations', label: 'Інтеграції', icon: <Globe size={14} />, adminOnly: true },
  { key: 'billing', label: 'Використання', icon: <Sparkles size={14} />, adminOnly: true },
];

/* ── ProfileTab ───────────────────────────────── */

function ProfileTab({ session: sess, updateSession }: { session: any; updateSession: any }) {
  const user = sess?.user;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [displayRole, setDisplayRole] = useState('');
  const [timezone, setTimezone] = useState('Europe/Kyiv');
  const [language, setLanguage] = useState('uk');
  const [micOnJoin, setMicOnJoin] = useState(false);
  const [camOnJoin, setCamOnJoin] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState(true);
  const [emailReminder, setEmailReminder] = useState(true);
  const [emailReport, setEmailReport] = useState(true);
  const [actionItemNotif, setActionItemNotif] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || '');
        setTimezone(data.timezone || 'Europe/Kyiv');
        const p = data.preferences || {};
        setDisplayRole(p.displayRole || '');
        setLanguage(p.language || 'uk');
        setMicOnJoin(p.micOnJoin ?? false);
        setCamOnJoin(p.camOnJoin ?? false);
        setLiveTranscript(p.liveTranscript ?? true);
        setEmailReminder(p.emailReminder ?? true);
        setEmailReport(p.emailReport ?? true);
        setActionItemNotif(p.actionItemNotif ?? true);
        setWeeklyDigest(p.weeklyDigest ?? false);
        setTwoFactorEnabled(data.twoFactorEnabled ?? false);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, timezone,
          preferences: { displayRole, language, micOnJoin, camOnJoin, liveTranscript, emailReminder, emailReport, actionItemNotif, weeklyDigest },
        }),
      });
      setSaved(true);
      if (name !== user?.name) await updateSession({ name });
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }, [name, timezone, displayRole, language, micOnJoin, camOnJoin, liveTranscript, emailReminder, emailReport, actionItemNotif, weeklyDigest, user?.name, updateSession]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Завантаження...</div>;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 18 }}>
        <button className={saved ? 'btn' : 'btn btn-primary'} onClick={saveSettings} disabled={saving} style={{ fontWeight: 600 }}>
          {saved ? <><Check size={15} /> Збережено</> : saving ? 'Збереження...' : <><Save size={15} /> Зберегти</>}
        </button>
      </div>

      <div className="card" style={{ padding: '18px 22px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18 }}>
          <Avatar name={user?.name ?? 'User'} image={user?.image} size="lg" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{user?.name ?? 'User'}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{user?.email}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <span className="chip" style={{ background: 'color-mix(in oklab, var(--green) 14%, transparent)', color: '#a7f3d0', borderColor: 'color-mix(in oklab, var(--green) 30%, transparent)' }}>
                <Globe size={11} /> Google SSO
              </span>
            </div>
          </div>
        </div>
        <div className="settings-grid-2" style={{ display: 'grid', gap: 14 }}>
          <FieldWrapper label="Ім'я"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></FieldWrapper>
          <FieldWrapper label="Роль"><input className="field" value={displayRole} onChange={(e) => setDisplayRole(e.target.value)} placeholder="Product Manager" /></FieldWrapper>
          <FieldWrapper label="Часовий пояс">
            <Select value={timezone} onChange={setTimezone} options={[
              { value: 'Europe/Kyiv', label: 'Europe/Kyiv (UTC+3)' },
              { value: 'Europe/Warsaw', label: 'Europe/Warsaw (UTC+2)' },
              { value: 'America/New_York', label: 'America/New_York (UTC-4)' },
            ]} />
          </FieldWrapper>
          <FieldWrapper label="Мова інтерфейсу">
            <Select value={language} onChange={setLanguage} options={[
              { value: 'uk', label: 'Українська' },
              { value: 'en', label: 'English' },
            ]} />
          </FieldWrapper>
        </div>
      </div>

      <div className="card" style={{ padding: '18px 22px', marginBottom: 18 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Аудіо & відео</div>
        <Toggle label="Заходити в мітинг з увімкненим мікрофоном" value={micOnJoin} onChange={setMicOnJoin} />
        <Toggle label="Заходити в мітинг з увімкненою камерою" value={camOnJoin} onChange={setCamOnJoin} />
        <Toggle label="Live transcription за замовчуванням" value={liveTranscript} onChange={setLiveTranscript} />

      </div>

      <div className="card" style={{ padding: '18px 22px', marginBottom: 18 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Нотифікації</div>
        <PushToggle />
        <Toggle label="Email-нагадування за 15 хв до мітингу" value={emailReminder} onChange={setEmailReminder} />
        <Toggle label="Email зі звітом після мітингу" value={emailReport} onChange={setEmailReport} />
        <Toggle label="Нотифікація, коли вам призначено action item" value={actionItemNotif} onChange={setActionItemNotif} />
        <Toggle label="Щотижневий дайджест" value={weeklyDigest} onChange={setWeeklyDigest} />
      </div>

      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Безпека</div>
        <TwoFactorSecurity enabled={twoFactorEnabled} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--red)' }}>Вийти з акаунту</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Завершити поточну сесію</div>
          </div>
          <button className="btn btn-sm" onClick={() => signOut()} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', borderColor: 'color-mix(in oklab, var(--red) 30%, var(--border))' }}>
            <LogOut size={13} /> Вийти
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── UsersTab ─────────────────────────────────── */

interface UserRecord {
  id: string; name: string; email: string; image?: string | null;
  role: 'admin' | 'member' | 'viewer'; lastLogin?: string | null; createdAt?: string;
}

function getUserStatus(lastLogin?: string | null): { label: string; color: string } {
  if (!lastLogin) return { label: 'Не входив', color: 'var(--muted)' };
  const diff = Date.now() - new Date(lastLogin).getTime();
  const mins = diff / 60000;
  if (mins < 10) return { label: 'Online', color: 'var(--green)' };
  if (mins < 60) return { label: `${Math.round(mins)} хв тому`, color: 'var(--amber)' };
  const hours = Math.round(mins / 60);
  if (hours < 24) return { label: `${hours} год тому`, color: 'var(--muted)' };
  const days = Math.round(hours / 24);
  return { label: `${days} дн тому`, color: 'var(--muted)' };
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Адмін',
  member: 'Учасник',
  viewer: 'Глядач',
};

function UsersTab() {
  const { data: session } = useSession();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    const withPassword = invitePassword.trim().length > 0;
    if (withPassword && invitePassword.length < 8) {
      setInviteMsg({ ok: false, text: 'Пароль — щонайменше 8 символів' });
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
        setUsers((us) => {
          const exists = us.some((x) => x.id === d.user.id);
          return exists ? us.map((x) => (x.id === d.user.id ? { ...x, ...d.user } : x)) : [...us, d.user];
        });
        setInviteMsg({
          ok: true,
          text: withPassword
            ? (d.emailed ? 'Створено · креди надіслано на пошту' : 'Створено · передайте пароль користувачу')
            : (d.emailSent ? 'Запрошення надіслано' : 'Додано (лист не надіслано — перевірте SMTP)'),
        });
        setInviteEmail(''); setInvitePassword('');
        setTimeout(() => { setInviteOpen(false); setInviteMsg(null); }, 1800);
      } else {
        setInviteMsg({ ok: false, text: d.error || 'Помилка' });
      }
    } catch { setInviteMsg({ ok: false, text: 'Помилка мережі' }); }
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
            id: (session.user as any).id ?? '1',
            name: session.user.name ?? 'Ви',
            email: session.user.email ?? '',
            image: session.user.image,
            role: 'admin', lastLogin: new Date().toISOString(),
          }]);
        }
      });
    return () => { cancelled = true; };
  }, [session]);

  const filtered = users.filter(
    (u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="tasks-search" style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input className="field" placeholder="Шукати користувача…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 34, height: 36 }} />
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>{filtered.length} з {users.length}</div>
        <button className="btn btn-primary" onClick={() => { setInviteOpen(true); setInviteMsg(null); }}><Plus size={14} /> Запросити</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="admin-table-header" style={{ display: 'grid', padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
          <div>Користувач</div><div>Email</div><div>Роль</div><div>Статус</div><div />
        </div>
        {filtered.map((u) => {
          const isMe = session?.user?.email === u.email;
          return (
            <div key={u.id} className="admin-table-row" style={{ display: 'grid', padding: '12px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={u.name} image={u.image} size="md" />
                <div>
                  <div style={{ fontWeight: 500 }}>{u.name}{isMe && <span className="chip" style={{ marginLeft: 6 }}>Це ви</span>}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{ROLE_LABELS[u.role] || u.role}</div>
                </div>
              </div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{u.email}</div>
              <div>
                <Select
                  value={u.role}
                  options={[
                    { value: 'admin', label: 'Адмін' },
                    { value: 'member', label: 'Учасник' },
                    { value: 'viewer', label: 'Глядач' },
                  ]}
                  style={{ height: 32, fontSize: 12.5, width: 132, maxWidth: '100%' }}
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
                        alert(err.error || 'Не вдалося змінити роль');
                        setUsers((us) => us.map((x) => x.id === u.id ? { ...x, role: prev } : x));
                      }
                    } catch {
                      alert('Помилка мережі');
                      setUsers((us) => us.map((x) => x.id === u.id ? { ...x, role: prev } : x));
                    }
                  }}
                />
              </div>
              <div>
                {(() => {
                  const st = getUserStatus(u.lastLogin);
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-2)' }}>{st.label}</span>
                    </span>
                  );
                })()}
              </div>
              {isMe ? (
                <div style={{ width: 30, height: 30 }} />
              ) : (
                <button
                  className="btn btn-ghost btn-icon"
                  title="Видалити користувача"
                  disabled={deletingId === u.id}
                  onClick={async () => {
                    if (!window.confirm(`Видалити користувача ${u.name} (${u.email})?\n\nЙого мітинги та звіти перейдуть до вас. Таски й участі будуть відв'язані. Дію не можна скасувати.`)) return;
                    setDeletingId(u.id);
                    try {
                      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
                      if (res.ok) {
                        setUsers((us) => us.filter((x) => x.id !== u.id));
                      } else {
                        const err = await res.json().catch(() => ({}));
                        alert(err.error || 'Не вдалося видалити користувача');
                      }
                    } catch {
                      alert('Помилка мережі');
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                  style={{ width: 30, height: 30, color: 'var(--red)' }}
                >
                  {deletingId === u.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {inviteOpen && (
        <div onClick={() => setInviteOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'fadeIn .15s' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 420, maxWidth: '92vw', padding: '22px 24px' }}>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Додати користувача</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 18 }}>Google-запрошення або акаунт email+пароль (задайте тимчасовий пароль).</div>
            <FieldWrapper label="Email">
              <input className="field" type="email" value={inviteEmail} placeholder="user@example.com" autoFocus
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendInvite(); }} />
            </FieldWrapper>
            <div style={{ marginTop: 14 }}>
              <FieldWrapper label="Роль">
                <Select value={inviteRole} onChange={setInviteRole} options={[
                  { value: 'member', label: 'Учасник' },
                  { value: 'admin', label: 'Адмін' },
                  { value: 'viewer', label: 'Глядач' },
                ]} />
              </FieldWrapper>
            </div>
            <div style={{ marginTop: 14 }}>
              <FieldWrapper label="Тимчасовий пароль (опційно)">
                <input className="field" type="text" value={invitePassword} placeholder="порожньо = Google-запрошення"
                  onChange={(e) => setInvitePassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendInvite(); }} />
              </FieldWrapper>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.45 }}>
                Задасте пароль — створиться акаунт email+пароль (користувач змінить його при першому вході). Порожньо — надішлемо Google-запрошення.
              </div>
            </div>
            {inviteMsg && <div style={{ marginTop: 12, fontSize: 12.5, color: inviteMsg.ok ? 'var(--green)' : '#f87171' }}>{inviteMsg.text}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-sm" onClick={() => setInviteOpen(false)}>Скасувати</button>
              <button className="btn btn-primary btn-sm" onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={13} />} Надіслати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── WorkspaceTab ─────────────────────────────── */

function WorkspaceTab() {
  const [ws, setWs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [my2fa, setMy2fa] = useState<boolean | null>(null); // current admin's 2FA status
  const [show2faSetup, setShow2faSetup] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    fetch('/api/settings/workspace')
      .then(r => r.json())
      .then(d => { if (!d.error) setWs(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setMy2fa(!!d.twoFactorEnabled))
      .catch(() => {});
  }, []);

  const set = (k: string, v: any) => setWs((s: any) => ({ ...s, [k]: v }));

  const save = async () => {
    if (!ws) return;
    setSaving(true); setSaved(false); setSaveErr('');
    try {
      const res = await fetch('/api/settings/workspace', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ws),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
      else { setSaveErr(d.error || 'Не вдалося зберегти'); }
    } catch (e) { setSaveErr('Помилка мережі'); }
    finally { setSaving(false); }
  };

  if (loading || !ws) {
    return <div style={{ maxWidth: 1000, margin: '0 auto', padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Завантаження...</div>;
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Загальне */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Загальне</div>
        <div className="settings-grid-2" style={{ display: 'grid', gap: 14 }}>
          <FieldWrapper label="Назва workspace">
            <input className="field" value={ws.WS_NAME} onChange={e => set('WS_NAME', e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="DNS / Custom domain">
            <input className="field" value={ws.WS_DOMAIN} onChange={e => set('WS_DOMAIN', e.target.value)} />
          </FieldWrapper>
          <FieldWrapper label="Часовий пояс за замовч.">
            <Select value={ws.WS_TIMEZONE} onChange={(v) => set('WS_TIMEZONE', v)} options={[
              { value: 'Europe/Kyiv', label: 'Europe/Kyiv' },
              { value: 'Europe/Warsaw', label: 'Europe/Warsaw' },
              { value: 'America/New_York', label: 'America/New_York' },
            ]} />
          </FieldWrapper>
          <FieldWrapper label="Мова інтерфейсу за замовч.">
            <Select value={ws.WS_LANGUAGE} onChange={(v) => set('WS_LANGUAGE', v)} options={[
              { value: 'uk', label: 'Українська' },
              { value: 'en', label: 'English' },
            ]} />
          </FieldWrapper>
        </div>
      </div>

      {/* Способи входу */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Способи входу</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>Як користувачі авторизуються. Хоча б один має бути ввімкнено.</div>
        <Toggle label="Google SSO" value={ws.AUTH_GOOGLE_ENABLED} onChange={v => set('AUTH_GOOGLE_ENABLED', v)} />
        <Toggle label="Email + пароль" value={ws.AUTH_PASSWORD_ENABLED} onChange={v => set('AUTH_PASSWORD_ENABLED', v)} />
        {ws.AUTH_PASSWORD_ENABLED && (
          <>
            <Toggle label="Дозволити самореєстрацію (заявки з апрувом адміна)" value={ws.AUTH_SELFREG} onChange={v => set('AUTH_SELFREG', v)} />
            {ws.AUTH_SELFREG && (
              <div style={{ marginTop: 10 }}>
                <FieldWrapper label="Дозволені домени (через кому, порожньо = будь-який)">
                  <input className="field" value={ws.AUTH_SELFREG_DOMAINS || ''} placeholder="company.com, team.com" onChange={e => set('AUTH_SELFREG_DOMAINS', e.target.value)} />
                </FieldWrapper>
              </div>
            )}
          </>
        )}
      </div>

      {/* Політики */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Політики мітингів</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>Застосовуються до всіх нових мітингів</div>
        <Toggle label="Дозволити гостів за лінком (без акаунту)" value={ws.WS_GUEST_ACCESS} onChange={v => set('WS_GUEST_ACCESS', v)} />
        <Toggle label="AI summary & action items автоматично" value={ws.WS_AI_SUMMARY} onChange={v => set('WS_AI_SUMMARY', v)} />
        <Toggle label="Live transcription за замовчуванням" value={ws.WS_LIVE_TRANSCRIPTION} onChange={v => set('WS_LIVE_TRANSCRIPTION', v)} />
        <Toggle label="Записувати всі мітинги (recording)" value={ws.WS_RECORD_ALL} onChange={v => set('WS_RECORD_ALL', v)} />
        <Toggle label="Вимагати 2FA для адмінів" value={ws.WS_REQUIRE_2FA} onChange={v => set('WS_REQUIRE_2FA', v)} disabled={my2fa === false && !ws.WS_REQUIRE_2FA} />
        {my2fa === false && !ws.WS_REQUIRE_2FA && (
          <div style={{
            marginTop: 12, padding: '12px 14px', borderRadius: 10,
            background: 'color-mix(in oklab, var(--amber) 12%, transparent)',
            border: '1px solid color-mix(in oklab, var(--amber) 35%, var(--border))',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <ShieldAlert size={18} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Спершу налаштуйте власну 2FA</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                Не можна вимагати 2FA від адмінів, поки ви самі його не налаштували — інакше втратите доступ. Після налаштування тумблер стане доступним.
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => setShow2faSetup(true)} style={{ marginTop: 10 }}>
                <Shield size={13} /> Налаштувати 2FA
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ліміти */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Ліміти</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>Технічні обмеження self-hosted інстансу</div>
        <div className="settings-grid-3" style={{ display: 'grid', gap: 14 }}>
          <FieldWrapper label="Макс. учасників на кімнату">
            <input className="field" type="number" value={ws.WS_MAX_PARTICIPANTS} onChange={e => set('WS_MAX_PARTICIPANTS', Number(e.target.value))} />
          </FieldWrapper>
          <FieldWrapper label="Макс. тривалість (хв)">
            <input className="field" type="number" value={ws.WS_MAX_DURATION_MIN} onChange={e => set('WS_MAX_DURATION_MIN', Number(e.target.value))} />
          </FieldWrapper>
          <FieldWrapper label="Зберігання записів (днів, 0 = ∞)">
            <input className="field" type="number" value={ws.WS_RETENTION_DAYS} onChange={e => set('WS_RETENTION_DAYS', Number(e.target.value))} />
          </FieldWrapper>
        </div>
      </div>

      {/* Ціни */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Ціни постачальників</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>Для калькуляції витрат у вкладці «Використання»</div>
        <div className="settings-grid-2" style={{ display: 'grid', gap: 14 }}>
          <FieldWrapper label="DeepSeek вхід ($ / M токенів)">
            <input className="field" type="number" step="0.01" value={ws.PRICE_DEEPSEEK_IN} onChange={e => set('PRICE_DEEPSEEK_IN', Number(e.target.value))} />
          </FieldWrapper>
          <FieldWrapper label="DeepSeek вихід ($ / M токенів)">
            <input className="field" type="number" step="0.01" value={ws.PRICE_DEEPSEEK_OUT} onChange={e => set('PRICE_DEEPSEEK_OUT', Number(e.target.value))} />
          </FieldWrapper>
          <FieldWrapper label="Deepgram ($ / хв)">
            <input className="field" type="number" step="0.0001" value={ws.PRICE_DEEPGRAM_MIN} onChange={e => set('PRICE_DEEPGRAM_MIN', Number(e.target.value))} />
          </FieldWrapper>
          <FieldWrapper label="Ліміт email / міс">
            <input className="field" type="number" value={ws.EMAIL_LIMIT} onChange={e => set('EMAIL_LIMIT', Number(e.target.value))} />
          </FieldWrapper>
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Зберегти
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={14} /> Збережено
          </span>
        )}
        {saveErr && (
          <span style={{ fontSize: 13, color: 'var(--red)' }}>{saveErr}</span>
        )}
      </div>

      {show2faSetup && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShow2faSetup(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: '22px 24px', position: 'relative' }}>
            <button className="btn btn-ghost btn-icon" onClick={() => setShow2faSetup(false)} style={{ position: 'absolute', top: 12, right: 12, width: 30, height: 30 }} aria-label="Закрити">
              <X size={16} />
            </button>
            <TwoFactorSetupFlow onCancel={() => setShow2faSetup(false)} onDone={() => { setMy2fa(true); setShow2faSetup(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── IntegrationsTab ──────────────────────────── */

function IntegrationsTab() {
  const INTEGRATION_ICONS: Record<string, React.ReactNode> = {
    LiveKit: <Video size={18} />,
    Deepgram: <Mic size={18} />,
    DeepSeek: <Sparkles size={18} />,
    'SMTP Email': <Mail size={18} />,
    'Google OAuth': <Globe size={18} />,
    PostgreSQL: <Archive size={18} />,
    'S3 Storage': <Download size={18} />,
  };
  const [integrations, setIntegrations] = useState<{ name: string; desc: string; status: string; metric?: string }[]>([]);

  // API Keys management
  const [keys, setKeys] = useState<Record<string, { value: string; masked: string; updatedAt: string }>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [keysLoading, setKeysLoading] = useState(true);

  // SMTP / email config
  const [smtp, setSmtp] = useState({ host: '', port: '587', secure: false, user: '', from: '', fromName: '', passSet: false });
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpLoading, setSmtpLoading] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // S3 / object storage config
  const [s3, setS3] = useState({ endpoint: '', region: '', bucket: '', accessKeyId: '', forcePathStyle: false, secretSet: false });
  const [s3Secret, setS3Secret] = useState('');
  const [s3Saving, setS3Saving] = useState(false);
  const [s3Saved, setS3Saved] = useState(false);
  const [s3Testing, setS3Testing] = useState(false);
  const [s3Test, setS3Test] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings/keys')
      .then(r => r.json())
      .then(data => { if (!data.error) setKeys(data); })
      .catch(console.error)
      .finally(() => setKeysLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/settings/email')
      .then(r => r.json())
      .then(d => {
        if (!d.error) setSmtp({
          host: d.host || '', port: String(d.port || '587'), secure: !!d.secure,
          user: d.user || '', from: d.from || '', fromName: d.fromName || '', passSet: !!d.passSet,
        });
      })
      .catch(() => {})
      .finally(() => setSmtpLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/settings/integrations')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.integrations)) setIntegrations(d.integrations); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/s3')
      .then(r => r.json())
      .then(d => {
        if (!d.error) setS3({
          endpoint: d.endpoint || '', region: d.region || '', bucket: d.bucket || '',
          accessKeyId: d.accessKeyId || '', forcePathStyle: !!d.forcePathStyle, secretSet: !!d.secretSet,
        });
      })
      .catch(() => {});
  }, []);

  const saveS3 = async () => {
    setS3Saving(true); setS3Saved(false);
    try {
      const payload: any = { endpoint: s3.endpoint, region: s3.region, bucket: s3.bucket, accessKeyId: s3.accessKeyId, forcePathStyle: s3.forcePathStyle };
      if (s3Secret) payload.secretAccessKey = s3Secret;
      const res = await fetch('/api/settings/s3', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        setS3Saved(true);
        if (s3Secret) { setS3((s) => ({ ...s, secretSet: true })); setS3Secret(''); }
        setTimeout(() => setS3Saved(false), 2500);
      }
    } catch (e) { console.error(e); }
    finally { setS3Saving(false); }
  };

  const testS3Conn = async () => {
    setS3Testing(true); setS3Test(null);
    try {
      const res = await fetch('/api/settings/s3/test', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      setS3Test(res.ok ? { ok: true, msg: 'Підключення успішне ✓' } : { ok: false, msg: d.error || 'Помилка' });
    } catch { setS3Test({ ok: false, msg: 'Помилка мережі' }); }
    finally { setS3Testing(false); }
  };

  const saveKey = async (keyName: string) => {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [keyName]: editValue.trim() }),
      });
      if (res.ok) {
        const data = await fetch('/api/settings/keys').then(r => r.json());
        if (!data.error) setKeys(data);
        setEditingKey(null);
        setEditValue('');
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const saveSmtp = async () => {
    setSmtpSaving(true); setSmtpSaved(false);
    try {
      const payload: any = { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, from: smtp.from, fromName: smtp.fromName };
      if (smtpPass) payload.pass = smtpPass;
      const res = await fetch('/api/settings/email', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSmtpSaved(true);
        if (smtpPass) { setSmtp(s => ({ ...s, passSet: true })); setSmtpPass(''); }
        setTimeout(() => setSmtpSaved(false), 2500);
      }
    } catch (e) { console.error(e); }
    finally { setSmtpSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/settings/email/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: testEmail.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      setTestResult(res.ok ? { ok: true, msg: 'Лист надіслано ✓ Перевір інбокс.' } : { ok: false, msg: d.error || 'Помилка надсилання' });
    } catch { setTestResult({ ok: false, msg: 'Помилка мережі' }); }
    finally { setTesting(false); }
  };

  const API_KEYS_CONFIG = [
    { key: 'DEEPGRAM_API_KEY', label: 'Deepgram API Key', service: 'Deepgram' },
    { key: 'DEEPGRAM_MODEL', label: 'Deepgram Model', service: 'Deepgram' },
    { key: 'DEEPGRAM_LANGUAGE', label: 'Deepgram Language', service: 'Deepgram' },
    { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek API Key', service: 'DeepSeek' },
    { key: 'DEEPSEEK_BASE_URL', label: 'DeepSeek Base URL', service: 'DeepSeek' },
    { key: 'DEEPSEEK_MODEL', label: 'DeepSeek Model', service: 'DeepSeek' },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Services list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {integrations.length === 0 && (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Перевірка інтеграцій...</div>
        )}
        {integrations.map((it) => {
          const connected = it.status === 'connected';
          const isError = it.status === 'error';
          return (
            <div key={it.name} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: connected ? 'color-mix(in oklab, var(--accent) 16%, var(--surface-2))' : 'var(--surface-2)',
                color: connected ? 'var(--accent-2)' : 'var(--muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{INTEGRATION_ICONS[it.name]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{it.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{it.desc}</div>
              </div>
              {it.metric && <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>{it.metric}</div>}
              {connected ? (
                <span className="chip" style={{ background: 'color-mix(in oklab, var(--green) 14%, transparent)', color: '#a7f3d0', borderColor: 'color-mix(in oklab, var(--green) 30%, transparent)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} /> OK
                </span>
              ) : isError ? (
                <span className="chip" style={{ background: 'color-mix(in oklab, var(--red) 14%, transparent)', color: '#fca5a5', borderColor: 'color-mix(in oklab, var(--red) 30%, transparent)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)' }} /> Помилка
                </span>
              ) : (
                <span className="chip" style={{ color: 'var(--muted)' }}>Не налаштовано</span>
              )}
            </div>
          );
        })}
      </div>

      {/* API Keys */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Key size={16} style={{ color: 'var(--accent-2)' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>API ключі</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Зміни застосовуються миттєво для нових мітингів</div>
          </div>
        </div>

        {keysLoading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Завантаження...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {API_KEYS_CONFIG.map(({ key: keyName, label }) => {
              const keyData = keys[keyName];
              const isEditing = editingKey === keyName;
              const isVisible = showKey[keyName];

              return (
                <div key={keyName} style={{
                  padding: '12px 14px', background: 'var(--surface)', borderRadius: 10,
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isEditing ? 10 : 0 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
                      {!isEditing && (
                        <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          {isVisible ? keyData?.value : keyData?.masked || 'Не налаштовано'}
                        </div>
                      )}
                    </div>
                    {!isEditing && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {keyData?.value && (
                          <button className="btn btn-ghost btn-icon" style={{ width: 30, height: 30 }}
                            onClick={() => setShowKey(p => ({ ...p, [keyName]: !p[keyName] }))}>
                            {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        )}
                        <button className="btn btn-sm" onClick={() => { setEditingKey(keyName); setEditValue(''); }}>
                          Змінити
                        </button>
                      </div>
                    )}
                  </div>
                  {isEditing && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="field" value={editValue} onChange={e => setEditValue(e.target.value)}
                        placeholder={
                          keyName === 'DEEPSEEK_BASE_URL' ? 'https://api.deepseek.com'
                          : keyName === 'DEEPSEEK_MODEL' ? 'deepseek-chat'
                          : keyName === 'DEEPGRAM_MODEL' ? 'nova-3'
                          : keyName === 'DEEPGRAM_LANGUAGE' ? 'multi'
                          : 'Вставте новий ключ...'
                        }
                        style={{ flex: 1, fontSize: 13, fontFamily: 'var(--font-mono)' }}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveKey(keyName); if (e.key === 'Escape') setEditingKey(null); }}
                      />
                      <button className="btn btn-primary btn-sm" onClick={() => saveKey(keyName)} disabled={saving || !editValue.trim()}>
                        <Save size={13} />
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditingKey(null)}>Скасувати</button>
                    </div>
                  )}
                  {keyData?.updatedAt && !isEditing && (
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>
                      Оновлено: {new Date(keyData.updatedAt).toLocaleDateString('uk-UA')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Email / SMTP */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Mail size={16} style={{ color: 'var(--accent-2)' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Email / SMTP</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Транзакційна пошта через ваш SMTP-сервер</div>
          </div>
        </div>

        {smtpLoading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Завантаження...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <FieldWrapper label="SMTP сервер">
                <input className="field" value={smtp.host} placeholder="smtp.gmail.com"
                  onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="Порт">
                <input className="field" value={smtp.port} placeholder="587" inputMode="numeric"
                  onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))} />
              </FieldWrapper>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldWrapper label="Користувач (логін)">
                <input className="field" value={smtp.user} placeholder="admin@example.com"
                  onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label={smtp.passSet ? 'Пароль (збережено · введіть новий для зміни)' : 'Пароль / App Password'}>
                <input className="field" type="password" value={smtpPass}
                  placeholder={smtp.passSet ? '••••••••••••' : 'App Password'}
                  onChange={e => setSmtpPass(e.target.value)} />
              </FieldWrapper>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldWrapper label="Адреса відправника (From)">
                <input className="field" value={smtp.from} placeholder="admin@example.com"
                  onChange={e => setSmtp(s => ({ ...s, from: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="Ім'я відправника">
                <input className="field" value={smtp.fromName} placeholder="EZmeet"
                  onChange={e => setSmtp(s => ({ ...s, fromName: e.target.value }))} />
              </FieldWrapper>
            </div>

            <Toggle
              label="SSL/TLS (увімк. для порту 465 · для 587 вимкнено = STARTTLS)"
              value={smtp.secure}
              onChange={v => setSmtp(s => ({ ...s, secure: v }))}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={saveSmtp} disabled={smtpSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {smtpSaving
                  ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Save size={13} />} Зберегти
              </button>
              {smtpSaved && (
                <span style={{ fontSize: 12.5, color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Check size={13} /> Збережено
                </span>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Тестовий лист</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="field" value={testEmail}
                  placeholder="email для тесту (за замовч. — ваш)"
                  onChange={e => setTestEmail(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
                <button className="btn btn-sm" onClick={sendTest} disabled={testing}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {testing
                    ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Mail size={13} />} Надіслати тест
                </button>
              </div>
              {testResult && (
                <div style={{ fontSize: 12.5, color: testResult.ok ? 'var(--green)' : 'var(--red)' }}>
                  {testResult.msg}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* S3 / Object storage */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Download size={16} style={{ color: 'var(--accent-2)' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>S3 / Об'єктне сховище</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Зберігання записів мітингів (AWS S3 або сумісне: MinIO, Wasabi, Cloudflare R2)</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FieldWrapper label="Bucket">
              <input className="field" value={s3.bucket} placeholder="eam-recordings" onChange={e => setS3(s => ({ ...s, bucket: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label="Region">
              <input className="field" value={s3.region} placeholder="us-east-1" onChange={e => setS3(s => ({ ...s, region: e.target.value }))} />
            </FieldWrapper>
          </div>
          <FieldWrapper label="Endpoint (для S3-сумісних; порожньо = AWS)">
            <input className="field" value={s3.endpoint} placeholder="https://s3.eu-central-1.wasabisys.com" onChange={e => setS3(s => ({ ...s, endpoint: e.target.value }))} />
          </FieldWrapper>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FieldWrapper label="Access Key ID">
              <input className="field" value={s3.accessKeyId} placeholder="AKIA..." onChange={e => setS3(s => ({ ...s, accessKeyId: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label={s3.secretSet ? 'Secret Key (збережено · новий для зміни)' : 'Secret Access Key'}>
              <input className="field" type="password" value={s3Secret} placeholder={s3.secretSet ? '••••••••••••' : 'Secret'} onChange={e => setS3Secret(e.target.value)} />
            </FieldWrapper>
          </div>
          <Toggle label="Force path style (для MinIO / self-hosted)" value={s3.forcePathStyle} onChange={v => setS3(s => ({ ...s, forcePathStyle: v }))} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={saveS3} disabled={s3Saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {s3Saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Зберегти
            </button>
            <button className="btn btn-sm" onClick={testS3Conn} disabled={s3Testing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {s3Testing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />} Перевірити підключення
            </button>
            {s3Saved && <span style={{ fontSize: 12.5, color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Збережено</span>}
            {s3Test && <span style={{ fontSize: 12.5, color: s3Test.ok ? 'var(--green)' : '#f87171' }}>{s3Test.msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── BillingTab ───────────────────────────────── */

function BillingTab() {
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings/usage')
      .then(r => r.json())
      .then(data => { if (!data.error) setUsage(data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Завантаження...</div>;
  if (!usage) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Не вдалося завантажити дані</div>;

  const costs = usage.costs || {};
  const totalCost = costs.total || 0;
  const uahRate = 41.5;
  const meetingsPct = Math.min(100, (usage.meetings?.thisMonth || 0) * 2);
  const hoursPct = Math.min(100, (usage.hours?.thisMonth || 0) * 2);
  const aiPct = Math.min(100, (usage.actionItems?.thisMonth || 0) / 2);
  const emailPct = usage.emails?.limit ? Math.round((usage.emails.thisMonth / usage.emails.limit) * 100) : 0;

  // Format cost with enough precision
  const fmtCost = (v: number) => {
    if (v === 0) return '$0.00';
    if (v < 0.01) return '$' + v.toFixed(4);
    if (v < 0.10) return '$' + v.toFixed(3);
    return '$' + v.toFixed(2);
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="billing-grid" style={{ display: 'grid', gap: 18 }}>
        <div className="card" style={{
          padding: 24, gridColumn: '1 / -1',
          background: 'linear-gradient(135deg, color-mix(in oklab, var(--accent) 14%, var(--surface)) 0%, var(--surface) 60%)',
          borderColor: 'color-mix(in oklab, var(--accent) 25%, var(--border))',
        }}>
          <div style={{ fontSize: 11.5, color: 'var(--accent-2)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 8 }}>Витрати цього місяця</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmtCost(totalCost)}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{'≈ ' + (totalCost * uahRate < 1 ? (totalCost * uahRate).toFixed(2) : Math.round(totalCost * uahRate)) + ' ₴ · self-hosted, лише API-витрати'}</div>
          </div>
          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--text-2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>DeepSeek {fmtCost(costs.deepseek || 0)}</span>
            <span>Deepgram {fmtCost(costs.deepgram || 0)}</span>
            {(usage.ai?.costPerReport > 0) && <span style={{ color: 'var(--muted)' }}>~{fmtCost(usage.ai.costPerReport)} / звіт</span>}
          </div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Цього місяця</div>
          <UsageRow label="Мітингів проведено" value={String(usage.meetings?.thisMonth || 0)} pct={meetingsPct} />
          <UsageRow label="Годин записано" value={String(usage.hours?.thisMonth || 0)} pct={hoursPct} />
          <UsageRow label="Action items" value={String(usage.actionItems?.thisMonth || 0)} pct={aiPct} />
          <UsageRow label="Email" value={(usage.emails?.thisMonth || 0) + ' / ' + (usage.emails?.limit || 3000)} pct={emailPct} />
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>AI аналітика</div>
          <UsageRow label="AI звіти" value={String(usage.ai?.reportsGenerated || 0)} pct={Math.min(100, (usage.ai?.reportsGenerated || 0) * 5)} />
          <UsageRow label="Токени (вхід)" value={((usage.ai?.tokensInput || 0) / 1000).toFixed(1) + 'K'} pct={Math.min(100, (usage.ai?.tokensInput || 0) / 10000)} />
          <UsageRow label="Токени (вихід)" value={((usage.ai?.tokensOutput || 0) / 1000).toFixed(1) + 'K'} pct={Math.min(100, (usage.ai?.tokensOutput || 0) / 5000)} />
          <UsageRow label="Транскрипцій" value={String(usage.transcriptSegments?.thisMonth || 0)} pct={Math.min(100, (usage.transcriptSegments?.thisMonth || 0) / 10)} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            {'Всього мітингів: ' + (usage.meetings?.total || 0) + ' · Всього tasks: ' + (usage.actionItems?.total || 0) + ' · Користувачів: ' + (usage.users || 0)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────── */

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const role = (session?.user as any)?.role;
  const isAdmin = role === 'admin';

  const [tab, setTab] = useState<TabKey>('profile');
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '18px 28px 0', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>Налаштування</h1>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {isAdmin ? 'Особисті параметри та адміністрування' : 'Особисті параметри облікового запису'}
        </div>
        <div className="admin-tabs" style={{ display: 'flex', gap: 2, marginTop: 18 }}>
          {visibleTabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className="btn btn-ghost" style={{
              padding: '10px 16px', borderRadius: 0,
              borderBottom: '2px solid ' + (tab === t.key ? 'var(--accent)' : 'transparent'),
              color: tab === t.key ? 'var(--text)' : 'var(--muted)',
              fontWeight: tab === t.key ? 600 : 500,
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="page-container" style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'profile' && <ProfileTab session={session} updateSession={updateSession} />}
        {tab === 'users' && isAdmin && <UsersTab />}
        {tab === 'workspace' && isAdmin && <WorkspaceTab />}
        {tab === 'integrations' && isAdmin && <IntegrationsTab />}
        {tab === 'billing' && isAdmin && <BillingTab />}
      </div>
    </div>
  );
}
