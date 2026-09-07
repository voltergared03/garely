'use client';

import { useState, useEffect, useCallback } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Globe, LogOut, Save, Check, Calendar as CalendarIcon, Link2, Unlink, AlertCircle } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { TwoFactorSecurity } from '@/components/twofa/security-card';
import { PushToggle } from '@/components/push-toggle';
import { signOut } from 'next-auth/react';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/i18n/locales';
import { Toggle, FieldWrapper } from '../components/shared';
import { PasswordSection } from './PasswordSection';
import s from './ProfileTab.module.css';

// Two-way Google Calendar sync — per-user OAuth into a dedicated "Garely"
// calendar: events created/edited/deleted there become Garely meetings and
// vice versa. Separate from the read-only ICS feed above.
function GoogleCalendarCard() {
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [conn, setConn] = useState<{
    googleEmail?: string | null; status?: string; lastError?: string | null; lastSyncedAt?: string | null;
  } | null>(null);
  const [flash, setFlash] = useState(''); // result of the ?gcal= redirect

  const load = useCallback(() => {
    fetch('/api/integrations/google')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConn(d?.connected ? d.connection : null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // Surface the OAuth round-trip result once, then clean the URL.
    const sp = new URLSearchParams(window.location.search);
    const res = sp.get('gcal');
    if (res) {
      setFlash(res);
      sp.delete('gcal');
      const qs = sp.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [load]);

  const disconnect = async () => {
    if (!confirm(t('settings.gcalDisconnectConfirm'))) return;
    setBusy(true);
    try {
      const r = await fetch('/api/integrations/google', { method: 'DELETE' });
      if (r.ok) setConn(null);
    } finally { setBusy(false); }
  };

  const broken = conn && conn.status !== 'active';

  return (
    <div className={`card ${s.cardPad}`}>
      <div className={s.gcalTitle}>
        <CalendarIcon size={15} className={s.gcalIcon} /> {t('settings.gcalTitle')}
      </div>
      <div className={s.gcalDesc}>{t('settings.gcalDesc')}</div>

      {flash === 'connected' && (
        <div className={s.gcalFlashOk}>
          <Check size={13} /> {t('settings.gcalConnected')}
        </div>
      )}
      {(flash === 'denied' || flash === 'error' || flash === 'invalid' || flash === 'noscope') && (
        <div className={s.gcalFlashErr}>
          <AlertCircle size={13} /> {t('settings.gcalConnectFailed')}
        </div>
      )}

      {loading ? (
        <div className={s.gcalLoading}>{t('common.loading')}</div>
      ) : conn ? (
        <div className={s.connWrap}>
          <div className={s.connRow}>
            <span className={`chip ${broken ? s.chipBroken : s.chipOk}`}>
              <span className={s.statusDot} style={{ background: broken ? 'var(--red)' : 'var(--green)' }} />
              {broken ? t('settings.gcalStatusBroken') : t('settings.gcalStatusActive')}
            </span>
            {conn.googleEmail && <span className={`mono ${s.connEmail}`}>{conn.googleEmail}</span>}
          </div>
          {conn.lastSyncedAt && (
            <div className={s.lastSync}>
              {t('settings.gcalLastSync')} {new Date(conn.lastSyncedAt).toLocaleString()}
            </div>
          )}
          {broken && (
            <div className={s.reconnectHint}>{t('settings.gcalReconnectHint')}</div>
          )}
          <div className={s.btnRow}>
            {broken && (
              <a className={`btn btn-primary btn-sm ${s.linkReset}`} href="/api/integrations/google/connect">
                <Link2 size={13} /> {t('settings.gcalReconnect')}
              </a>
            )}
            <button className="btn btn-sm" onClick={disconnect} disabled={busy}>
              <Unlink size={13} /> {t('settings.gcalDisconnect')}
            </button>
          </div>
        </div>
      ) : (
        <a className={`btn btn-primary btn-sm ${s.connectLink}`} href="/api/integrations/google/connect">
          <Link2 size={13} /> {t('settings.gcalConnect')}
        </a>
      )}
    </div>
  );
}

export function ProfileTab({ session: sess, updateSession }: { session: any; updateSession: any }) {
  const t = useTranslations();
  const user = sess?.user;
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [displayRole, setDisplayRole] = useState('');
  const [timezone, setTimezone] = useState('Europe/Kyiv');
  const [language, setLanguage] = useState('uk');
  const [spokenLang, setSpokenLang] = useState(''); // '' = auto-detect
  const [micOnJoin, setMicOnJoin] = useState(false);
  const [camOnJoin, setCamOnJoin] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState(true);
  const [emailReminder, setEmailReminder] = useState(true);
  const [emailReport, setEmailReport] = useState(true);
  const [actionItemNotif, setActionItemNotif] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || '');
        setTimezone(data.timezone || 'Europe/Kyiv');
        const p = data.preferences || {};
        setDisplayRole(p.displayRole || '');
        setLanguage(p.language || 'uk');
        setSpokenLang(p.spokenLanguageLocked ? (p.spokenLanguage || '') : '');
        setMicOnJoin(p.micOnJoin ?? false);
        setCamOnJoin(p.camOnJoin ?? false);
        setLiveTranscript(p.liveTranscript ?? true);
        setEmailReminder(p.emailReminder ?? true);
        setEmailReport(p.emailReport ?? true);
        setActionItemNotif(p.actionItemNotif ?? true);
        setWeeklyDigest(p.weeklyDigest ?? false);
        setTwoFactorEnabled(data.twoFactorEnabled ?? false);
        setHasPassword(data.hasPassword ?? false);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      // spokenLanguageLocked=true forces this language (auto-detect won't override).
      const prefs: any = { displayRole, language, micOnJoin, camOnJoin, liveTranscript, emailReminder, emailReport, actionItemNotif, weeklyDigest, spokenLanguageLocked: !!spokenLang };
      if (spokenLang) prefs.spokenLanguage = spokenLang;
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, timezone, preferences: prefs }),
      });
      setSaved(true);
      if (name !== user?.name) await updateSession({ name });
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }, [name, timezone, displayRole, language, spokenLang, micOnJoin, camOnJoin, liveTranscript, emailReminder, emailReport, actionItemNotif, weeklyDigest, user?.name, updateSession]);

  // Interface language switches instantly: persist the preference, drop the
  // `locale` cookie that drives server rendering, refresh the session token,
  // then re-render the whole app in the chosen language.
  const changeLanguage = useCallback(async (v: string) => {
    setLanguage(v);
    document.cookie = `${LOCALE_COOKIE}=${v}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: { language: v } }),
      });
      await updateSession();
    } catch (e) { console.error(e); }
    router.refresh();
  }, [updateSession, router]);

  if (loading) return <div className={s.loadingWrap}>{t('common.loading')}</div>;

  return (
    <div className={s.container}>
      <div className={s.headerRow}>
        <button className={`${saved ? 'btn' : 'btn btn-primary'} ${s.saveBtn}`} onClick={saveSettings} disabled={saving}>
          {saved ? <><Check size={15} /> {t('common.saved')}</> : saving ? t('common.saving') : <><Save size={15} /> {t('common.save')}</>}
        </button>
      </div>

      <div className={`card ${s.cardPad}`}>
        <div className={s.profileHeader}>
          <Avatar name={user?.name ?? 'User'} image={user?.image} size="lg" />
          <div className={s.flex1}>
            <div className={s.userName}>{user?.name ?? 'User'}</div>
            <div className={`mono ${s.userEmail}`}>{user?.email}</div>
            <div className={s.ssoRow}>
              <span className={`chip ${s.ssoChip}`}>
                <Globe size={11} /> Google SSO
              </span>
            </div>
          </div>
        </div>
        <div className={`settings-grid-2 ${s.fieldsGrid}`}>
          <FieldWrapper label={t('settings.name')}><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></FieldWrapper>
          <FieldWrapper label={t('settings.role')}><input className="field" value={displayRole} onChange={(e) => setDisplayRole(e.target.value)} placeholder="Product Manager" /></FieldWrapper>
          <FieldWrapper label={t('settings.timezone')}>
            <Select value={timezone} onChange={setTimezone} options={[
              { value: 'Europe/Kyiv', label: 'Europe/Kyiv (UTC+3)' },
              { value: 'Europe/Warsaw', label: 'Europe/Warsaw (UTC+2)' },
              { value: 'America/New_York', label: 'America/New_York (UTC-4)' },
            ]} />
          </FieldWrapper>
          <FieldWrapper label={t('settings.interfaceLanguage')}>
            <Select value={language} onChange={changeLanguage} options={[
              { value: 'uk', label: 'Українська' },
              { value: 'en', label: 'English' },
            ]} />
          </FieldWrapper>
          <FieldWrapper label={t('settings.spokenLanguage')}>
            <Select value={spokenLang} onChange={setSpokenLang} options={[
              { value: '', label: t('settings.spokenLanguageAuto') },
              { value: 'uk', label: 'Українська' },
              { value: 'en', label: 'English' },
              { value: 'ru', label: 'Русский' },
            ]} />
          </FieldWrapper>
        </div>
        {/* Outside the grid: the switch is its own control, not a labelled field, and
            it saves on click rather than waiting for the form's Save — theme is a
            preview-as-you-pick setting, so making it wait would be the wrong model. */}
        <div className={s.themeWrap}>
          <ThemeToggle />
        </div>
      </div>

      <div className={`card ${s.cardPad}`}>
        <div className={s.sectionTitle}>{t('settings.audioVideo')}</div>
        <Toggle label={t('settings.micOnJoin')} value={micOnJoin} onChange={setMicOnJoin} />
        <Toggle label={t('settings.camOnJoin')} value={camOnJoin} onChange={setCamOnJoin} />
        <Toggle label={t('settings.liveTranscriptDefault')} value={liveTranscript} onChange={setLiveTranscript} />

      </div>

      <div className={`card ${s.cardPad}`}>
        <div className={s.sectionTitle}>{t('settings.notifications')}</div>
        <PushToggle />
        <Toggle label={t('settings.emailReminder')} value={emailReminder} onChange={setEmailReminder} />
        <Toggle label={t('settings.emailReport')} value={emailReport} onChange={setEmailReport} />
        <Toggle label={t('settings.actionItemNotif')} value={actionItemNotif} onChange={setActionItemNotif} />
        <Toggle label={t('settings.weeklyDigest')} value={weeklyDigest} onChange={setWeeklyDigest} />
      </div>

      <GoogleCalendarCard />

      <div className={`card ${s.cardPadOnly}`}>
        <div className={s.sectionTitle}>{t('settings.security')}</div>
        <TwoFactorSecurity enabled={twoFactorEnabled} />
        <PasswordSection hasPassword={hasPassword} />
        <div className={s.securityRow}>
          <div>
            <div className={s.signOutTitle}>{t('settings.signOutTitle')}</div>
            <div className={s.signOutDesc}>{t('settings.signOutDesc')}</div>
          </div>
          <button className={`btn btn-sm ${s.signOutBtn}`} onClick={() => signOut()}>
            <LogOut size={13} /> {t('sidebar.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
