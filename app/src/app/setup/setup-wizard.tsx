'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/ui/logo';
import { Select } from '@/components/ui/select';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/i18n/locales';
import { passwordProblem } from '@/lib/form-rules';
import {
  Check, Copy, ArrowRight, ArrowLeft, Loader2, KeyRound, Building2, Globe, ShieldCheck,
} from 'lucide-react';
import s from './setup-wizard.module.css';

const TOKEN_KEY = 'eam_setup_token';

const TZ_OPTIONS = [
  'Europe/Kyiv', 'Europe/Warsaw', 'Europe/London', 'Europe/Berlin',
  'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'UTC',
].map((v) => ({ value: v, label: v }));

const LANG_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'uk', label: 'Українська' },
];

interface Initial {
  wsName: string;
  wsDomain: string;
  wsTimezone: string;
  wsLanguage: string;
  hasGoogleId: boolean;
}

export function SetupWizard({ initial }: { initial: Initial }) {
  const t = useTranslations();
  const router = useRouter();
  const { status } = useSession();

  const STEPS = [t('setup.stepToken'), t('setup.stepSpace'), t('setup.stepLogin'), t('setup.stepAdmin')];

  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [wsName, setWsName] = useState(initial.wsName);
  const [wsDomain, setWsDomain] = useState(initial.wsDomain);
  const [wsTimezone, setWsTimezone] = useState(initial.wsTimezone);
  const [wsLanguage, setWsLanguage] = useState(initial.wsLanguage);
  const [googleId, setGoogleId] = useState('');
  const [googleSecret, setGoogleSecret] = useState('');
  // Auth methods (step 3)
  const [googleEnabled, setGoogleEnabled] = useState(true);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [selfReg, setSelfReg] = useState(false);
  const [selfRegDomains, setSelfRegDomains] = useState('');
  // First admin via password (step 4, when password method is on)
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Resume across refreshes / the Google OAuth round-trip.
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      setStep((s) => (s === 1 ? 2 : s));
    }
  }, []);
  useEffect(() => {
    if (status === 'authenticated' && token) setStep(4);
  }, [status, token]);

  const cleanDomain = wsDomain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const origin = cleanDomain ? `https://${cleanDomain}` : (typeof window !== 'undefined' ? window.location.origin : '');
  const redirectUri = `${origin}/api/auth/callback/google`;

  const copy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    });
  };

  // Picking the workspace language is the first setup choice — it sets the
  // system default for everyone AND switches the wizard itself live.
  const changeWizardLanguage = (v: string) => {
    setWsLanguage(v);
    document.cookie = `${LOCALE_COOKIE}=${v}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    router.refresh();
  };

  const saveConfig = useCallback(async (values: Record<string, string>) => {
    const res = await fetch('/api/setup/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, values }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || t('setup.errSaveFailed'));
    }
  }, [token, t]);

  const verifyToken = async () => {
    setErr(null); setBusy(true);
    try {
      const res = await fetch('/api/setup/verify-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        setToken(tokenInput.trim());
        sessionStorage.setItem(TOKEN_KEY, tokenInput.trim());
        setStep(2);
      } else {
        setErr(t('setup.errInvalidToken'));
      }
    } catch { setErr(t('setup.errNetwork')); }
    finally { setBusy(false); }
  };

  const saveIdentity = async () => {
    if (!wsName.trim() || !cleanDomain) { setErr(t('setup.errNameDomainRequired')); return; }
    setErr(null); setBusy(true);
    try {
      await saveConfig({
        WS_NAME: wsName.trim(),
        WS_DOMAIN: cleanDomain,
        WS_TIMEZONE: wsTimezone,
        WS_LANGUAGE: wsLanguage,
      });
      setStep(3);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const saveAuth = async () => {
    if (!googleEnabled && !passwordEnabled) { setErr(t('setup.errPickOneMethod')); return; }
    if (googleEnabled && (!googleId.trim() || !googleSecret.trim())) { setErr(t('setup.errGoogleCredsRequired')); return; }
    setErr(null); setBusy(true);
    try {
      const values: Record<string, string> = {
        AUTH_GOOGLE_ENABLED: googleEnabled ? 'true' : 'false',
        AUTH_PASSWORD_ENABLED: passwordEnabled ? 'true' : 'false',
        AUTH_SELFREG: passwordEnabled && selfReg ? 'true' : 'false',
        AUTH_SELFREG_DOMAINS: selfRegDomains.split(',').map((s) => s.trim()).filter(Boolean).join(','),
      };
      if (googleEnabled) {
        values.GOOGLE_CLIENT_ID = googleId.trim();
        values.GOOGLE_CLIENT_SECRET = googleSecret.trim();
      }
      await saveConfig(values);
      setStep(4);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // Password-auth setup: create the admin from email+password, then auto-login.
  const createPasswordAdmin = async () => {
    if (!adminEmail.trim() || !adminPassword) { setErr(t('setup.errEmailPasswordRequired')); return; }
    // Same rule the API applies — see lib/form-rules.
    if (passwordProblem(adminPassword)) { setErr(t('setup.errPasswordTooShort')); return; }
    setErr(null); setBusy(true);
    try {
      const res = await fetch('/api/setup/admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: adminEmail.trim(), name: adminName.trim(), password: adminPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setErr(d.error || t('setup.errCreateAdminFailed')); return; }
      sessionStorage.removeItem(TOKEN_KEY);
      const r = await signIn('credentials', {
        email: adminEmail.trim().toLowerCase(), password: adminPassword, redirect: false,
      });
      if (r?.error) { router.push('/login'); return; }
      router.push('/'); router.refresh();
    } catch { setErr(t('setup.errNetwork')); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    setErr(null); setBusy(true);
    try {
      const res = await fetch('/api/setup/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        sessionStorage.removeItem(TOKEN_KEY);
        router.push('/');
        router.refresh();
      } else {
        setErr(d.error || t('setup.errCompleteFailed'));
      }
    } catch { setErr(t('setup.errNetwork')); }
    finally { setBusy(false); }
  };

  return (
    <div className={s.page}>
      <div className={s.container}>
        <div className={s.logoRow}>
          <Logo size={26} />
        </div>

        {/* Step indicator */}
        <div className={s.stepsRow}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <div key={label} className={s.stepItem}>
                <div
                  className={s.stepBar}
                  style={{
                    background: done || active ? 'var(--accent)' : 'var(--border)',
                    opacity: done ? 0.6 : 1,
                  }}
                />
                <div className={s.stepLabel} style={{ color: active ? 'var(--text)' : 'var(--muted)', fontWeight: active ? 600 : 400 }}>
                  {label}
                </div>
              </div>
            );
          })}
        </div>

        <div className={`card fade-in ${s.card}`}>
          {/* STEP 1 — token */}
          {step === 1 && (
            <>
              <StepHead icon={<KeyRound size={18} />} title={t('setup.tokenTitle')} sub={t('setup.tokenSub')} />
              <FieldLabel>{t('setup.tokenLabel')}</FieldLabel>
              <input
                className="field" autoFocus value={tokenInput}
                placeholder={t('setup.tokenPlaceholder')} onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') verifyToken(); }}
              />
              <p className={s.tokenHint}>
                {t('setup.tokenHint')}
                <code className={s.tokenCode}>
                  docker compose logs eam-meet | grep -A2 &quot;SETUP&quot;
                </code>
              </p>
              <NavRow>
                <span />
                <PrimaryBtn onClick={verifyToken} busy={busy} disabled={!tokenInput.trim()}>{t('setup.next')}</PrimaryBtn>
              </NavRow>
            </>
          )}

          {/* STEP 2 — identity */}
          {step === 2 && (
            <>
              <StepHead icon={<Building2 size={18} />} title={t('setup.identityTitle')} sub={t('setup.identitySub')} />
              <FieldLabel>{t('setup.languageLabel')}</FieldLabel>
              <Select value={wsLanguage} onChange={changeWizardLanguage} options={LANG_OPTIONS} className={s.selectH38} />
              <p className={s.hintSmall}>{t('setup.languageHint')}</p>
              <FieldLabel style={{ marginTop: 14 }}>{t('setup.nameLabel')}</FieldLabel>
              <input className="field" value={wsName} placeholder={t('setup.namePlaceholder')} onChange={(e) => setWsName(e.target.value)} />
              <FieldLabel style={{ marginTop: 14 }}>{t('setup.domainLabel')}</FieldLabel>
              <input className="field" value={wsDomain} placeholder={t('setup.domainPlaceholder')} onChange={(e) => setWsDomain(e.target.value)} />
              <FieldLabel style={{ marginTop: 14 }}>{t('setup.timezoneLabel')}</FieldLabel>
              <Select value={wsTimezone} onChange={setWsTimezone} options={TZ_OPTIONS} className={s.selectH38} />
              <NavRow>
                <span />
                <PrimaryBtn onClick={saveIdentity} busy={busy}>{t('setup.next')}</PrimaryBtn>
              </NavRow>
            </>
          )}

          {/* STEP 3 — auth methods */}
          {step === 3 && (
            <>
              <StepHead icon={<Globe size={18} />} title={t('setup.authTitle')} sub={t('setup.authSub')} />
              <WizToggle label={t('setup.googleSso')} desc={t('setup.googleSsoDesc')} value={googleEnabled} onChange={setGoogleEnabled} />
              <WizToggle label={t('setup.emailPassword')} desc={t('setup.emailPasswordDesc')} value={passwordEnabled} onChange={setPasswordEnabled} />

              {googleEnabled && (
                <div className={s.divider}>
                  <div className={s.googleHint}>
                    {t.rich('setup.googleSetupHint', { b: (chunks) => <b>{chunks}</b> })}
                  </div>
                  <CopyRow label={t('setup.redirectUriLabel')} value={redirectUri} copied={copied === 'r'} onCopy={() => copy(redirectUri, 'r')} />
                  <CopyRow label={t('setup.jsOriginLabel')} value={origin} copied={copied === 'o'} onCopy={() => copy(origin, 'o')} />
                  <FieldLabel style={{ marginTop: 14 }}>{t('setup.clientIdLabel')}</FieldLabel>
                  <input className="field" value={googleId} placeholder="…apps.googleusercontent.com" onChange={(e) => setGoogleId(e.target.value)} />
                  <FieldLabel style={{ marginTop: 14 }}>{t('setup.clientSecretLabel')}</FieldLabel>
                  <input className="field" type="password" value={googleSecret} placeholder="GOCSPX-…" onChange={(e) => setGoogleSecret(e.target.value)} />
                </div>
              )}

              {passwordEnabled && (
                <div className={s.divider}>
                  <WizToggle label={t('setup.selfRegLabel')} desc={t('setup.selfRegDesc')} value={selfReg} onChange={setSelfReg} />
                  {selfReg && (
                    <>
                      <FieldLabel style={{ marginTop: 12 }}>{t('setup.allowedDomainsLabel')}</FieldLabel>
                      <input className="field" value={selfRegDomains} placeholder="company.com, team.com" onChange={(e) => setSelfRegDomains(e.target.value)} />
                      <p className={s.hintTiny}>{t('setup.allowedDomainsHint')}</p>
                    </>
                  )}
                </div>
              )}

              <NavRow>
                <GhostBtn onClick={() => { setErr(null); setStep(2); }}><ArrowLeft size={14} /> {t('common.back')}</GhostBtn>
                <PrimaryBtn onClick={saveAuth} busy={busy}>{t('setup.next')}</PrimaryBtn>
              </NavRow>
            </>
          )}

          {/* STEP 4 — claim admin */}
          {step === 4 && (
            <>
              <StepHead icon={<ShieldCheck size={18} />} title={t('setup.adminTitle')} sub={passwordEnabled ? t('setup.adminSubPassword') : t('setup.adminSubGoogle')} />
              {passwordEnabled ? (
                <>
                  <FieldLabel>{t('setup.emailLabel')}</FieldLabel>
                  <input className="field" type="email" value={adminEmail} placeholder="admin@company.com" onChange={(e) => setAdminEmail(e.target.value)} />
                  <FieldLabel style={{ marginTop: 14 }}>{t('setup.nameFieldLabel')}</FieldLabel>
                  <input className="field" value={adminName} placeholder={t('setup.adminNamePlaceholder')} onChange={(e) => setAdminName(e.target.value)} />
                  <FieldLabel style={{ marginTop: 14 }}>{t('setup.passwordLabel')}</FieldLabel>
                  <input className="field" type="password" value={adminPassword} placeholder={t('setup.passwordPlaceholder')}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createPasswordAdmin(); }} />
                  <NavRow>
                    <GhostBtn onClick={() => { setErr(null); setStep(3); }}><ArrowLeft size={14} /> {t('common.back')}</GhostBtn>
                    <PrimaryBtn onClick={createPasswordAdmin} busy={busy}>{t('setup.finish')}</PrimaryBtn>
                  </NavRow>
                </>
              ) : status === 'authenticated' ? (
                <>
                  <div className={s.successBox}>
                    <Check size={16} className={s.greenIcon} /> {t('setup.signedInGoogle')}
                  </div>
                  <p className={s.hintMuted}>
                    {t.rich('setup.finishHint', { code: (chunks) => <code>{chunks}</code> })}
                  </p>
                  <NavRow>
                    <GhostBtn onClick={() => { setErr(null); setStep(3); }}><ArrowLeft size={14} /> {t('common.back')}</GhostBtn>
                    <PrimaryBtn onClick={finish} busy={busy}>{t('setup.finish')}</PrimaryBtn>
                  </NavRow>
                </>
              ) : (
                <>
                  <p className={s.hintMuted}>
                    {t('setup.signInGooglePrompt')}
                  </p>
                  <button className={`btn btn-primary ${s.fullBtn}`}
                    onClick={() => { sessionStorage.setItem(TOKEN_KEY, token); signIn('google', { callbackUrl: '/setup' }); }}>
                    <Globe size={16} /> {t('setup.signInGoogle')}
                  </button>
                  <NavRow>
                    <GhostBtn onClick={() => { setErr(null); setStep(3); }}><ArrowLeft size={14} /> {t('common.back')}</GhostBtn>
                    <span />
                  </NavRow>
                </>
              )}
            </>
          )}

          {err && (
            <div className={s.errBox}>
              {err}
            </div>
          )}
        </div>

        <div className={s.footer}>
          {t('setup.footer')}
        </div>
      </div>
    </div>
  );
}

/* ── small presentational helpers ───────────────────────────── */

function StepHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className={s.stepHeadWrap}>
      <div className={s.stepHeadRow}>
        <span className={s.accentIcon}>{icon}</span>
        <h1 className={s.stepHeadTitle}>{title}</h1>
      </div>
      <p className={s.stepHeadSub}>{sub}</p>
    </div>
  );
}

function FieldLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className={s.fieldLabel} style={style}>{children}</div>;
}

function NavRow({ children }: { children: React.ReactNode }) {
  return <div className={s.navRow}>{children}</div>;
}

function PrimaryBtn({ children, onClick, busy, disabled }: { children: React.ReactNode; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button className={`btn btn-primary ${s.primaryBtn}`}
      onClick={onClick} disabled={busy || disabled}>
      {busy ? <Loader2 size={15} className="spin" /> : <>{children} <ArrowRight size={15} /></>}
    </button>
  );
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={`btn btn-ghost ${s.ghostBtn}`} onClick={onClick}>
      {children}
    </button>
  );
}

function WizToggle({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={s.toggleRow}>
      <div style={{ minWidth: 0 }}>
        <div className={s.toggleLabel}>{label}</div>
        {desc && <div className={s.toggleDesc}>{desc}</div>}
      </div>
      <button type="button" aria-label={label} onClick={() => onChange(!value)} className={s.toggleTrack} style={{
        background: value ? 'var(--accent)' : 'var(--surface-3)',
      }}>
        <span className={s.toggleDot} style={{ top: 3, left: value ? 19 : 3, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
      </button>
    </div>
  );
}

function CopyRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  const t = useTranslations();
  return (
    <div className={s.copyRow}>
      <div className={s.copyLabel}>{label}</div>
      <div className={s.copyValueRow}>
        <code className={s.copyCode}>{value}</code>
        <button className={`btn btn-ghost btn-icon ${s.copyBtn}`} title={t('setup.copy')} onClick={onCopy}>
          {copied ? <Check size={13} className={s.greenIcon} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}
