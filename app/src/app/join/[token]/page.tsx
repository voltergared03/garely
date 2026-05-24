'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link2, Video, Globe, ChevronLeft, AlertCircle } from 'lucide-react';
import { AvatarStack } from '@/components/ui/avatar';
import { Logo } from '@/components/ui/logo';

interface MeetingInfo {
  id: string;
  title: string;
  invitedBy: string;
  scheduledAt: string;
  participants: { name: string; image?: string | null }[];
  participantCount: number;
}

type Step = 'landing' | 'name';

export default function GuestJoinPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;

  const [step, setStep] = useState<Step>('landing');
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchMeeting() {
      try {
        const res = await fetch(`/api/meetings/join/${token}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError(t('join.errorNotFound'));
          } else {
            setError(t('join.errorLoadFailed'));
          }
          return;
        }
        const data = await res.json();
        setMeeting({
          ...data,
          invitedBy: data.createdBy?.name || t('join.organizer'),
          participantCount: data.participants?.length || 0,
          participants: (data.participants || []).map((p: any) => ({
            name: p.user?.name || p.guestName || 'Guest',
            image: p.user?.image || null,
          })),
        });
      } catch {
        setError(t('join.errorConnection'));
      } finally {
        setLoading(false);
      }
    }
    fetchMeeting();
  }, [token]);

  async function handleSubmit() {
    if (!guestName.trim() || !meeting) return;
    setSubmitting(true);
    // Go directly to lobby — the room page will handle getting the LiveKit token
    router.push(`/lobby/${meeting.id}?guest=${encodeURIComponent(guestName.trim())}`);
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- error / loading ----------
  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 28, height: 28, border: '2.5px solid var(--border)',
          borderTopColor: 'var(--accent)', borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && !meeting) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'var(--bg)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: 20,
      }}>
        <AlertCircle size={36} style={{ color: 'var(--red)' }} />
        <p style={{ color: 'var(--text-2)', fontSize: 15, textAlign: 'center', maxWidth: 360 }}>{error}</p>
        <button className="btn" onClick={() => router.push('/')} style={{ marginTop: 8 }}>
          {t('join.goHome')}
        </button>
      </div>
    );
  }

  if (!meeting) return null;

  // ---------- landing step ----------
  if (step === 'landing') {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at 20% 0%, color-mix(in oklab, var(--accent) 14%, var(--bg)) 0%, var(--bg) 60%)',
        display: 'flex', flexDirection: 'column', overflow: 'auto',
      }}>
        <div style={{ padding: '20px 24px', flexShrink: 0 }}>
          <Logo size={18} />
        </div>

        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 20px 40px',
        }}>
          <div className="card fade-in" style={{ maxWidth: 500, width: '100%', padding: '36px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span className="chip">
                <Link2 size={12} />
                {t('join.guestInvitation')}
              </span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', letterSpacing: '0.02em' }}>
                {token.length > 16 ? token.slice(0, 16) + '...' : token}
              </span>
            </div>

            <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
              {meeting.title}
            </h1>

            <p style={{ color: 'var(--text-2)', fontSize: 14, margin: '0 0 4px' }}>
              {t.rich('join.invitedBy', {
                name: meeting.invitedBy,
                b: (chunks) => <span style={{ fontWeight: 600, color: 'var(--text)' }}>{chunks}</span>,
              })}
            </p>
            {meeting.scheduledAt && (
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 24px' }}>
                {formatDate(meeting.scheduledAt)}, {formatTime(meeting.scheduledAt)}
              </p>
            )}

            {meeting.participants && meeting.participants.length > 0 && (
              <div style={{
                background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)',
                padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 28,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <AvatarStack users={meeting.participants} max={4} size="sm" />
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {t('join.participantsCount', { count: meeting.participantCount })}
                  </span>
                </div>
                <Video size={16} style={{ color: 'var(--muted)' }} />
              </div>
            )}

            <button className="btn btn-primary" style={{
              width: '100%', justifyContent: 'center', padding: '13px 16px',
              fontSize: 14, fontWeight: 600, marginBottom: 10,
            }} onClick={() => setStep('name')}>
              {t('join.joinAsGuest')}
            </button>

            <button className="btn" style={{
              width: '100%', justifyContent: 'center', padding: '13px 16px',
              fontSize: 14, fontWeight: 600, marginBottom: 24,
            }} onClick={() => router.push('/login')}>
              <Globe size={15} />
              {t('join.loginWithGoogle')}
            </button>

            <div style={{
              background: 'color-mix(in oklab, var(--amber) 10%, transparent)',
              border: '1px solid color-mix(in oklab, var(--amber) 25%, transparent)',
              borderRadius: 'var(--radius-sm)', padding: '12px 14px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <AlertCircle size={15} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
                {t('join.tokenWarning')}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- name step ----------
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at 20% 0%, color-mix(in oklab, var(--accent) 14%, var(--bg)) 0%, var(--bg) 60%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div className="card fade-in" style={{ maxWidth: 460, width: '100%', padding: '36px 32px' }}>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 20, marginLeft: -6 }}
          onClick={() => setStep('landing')}>
          <ChevronLeft size={15} />
          {t('common.back')}
        </button>

        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          {t('join.howToIntroduce')}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 28px' }}>
          {t('join.introduceSubtitle')}
        </p>

        <div style={{ marginBottom: 18 }}>
          <label className="field-label">
            {t('join.nameLabel')} <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <input className="field" type="text" placeholder={t('join.namePlaceholder')}
            value={guestName} onChange={(e) => setGuestName(e.target.value)} autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
        </div>

        <div style={{ marginBottom: 6 }}>
          <label className="field-label">
            {t('join.emailLabel')} <span style={{ color: 'var(--muted-2)', fontWeight: 400 }}>{t('join.optional')}</span>
          </label>
          <input className="field" type="email" placeholder="email@example.com"
            value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 28px', lineHeight: 1.5 }}>
          {t('join.emailHint')}
        </p>

        <button className="btn btn-primary" disabled={!guestName.trim() || submitting}
          style={{
            width: '100%', justifyContent: 'center', padding: '13px 16px',
            fontSize: 14, fontWeight: 600,
            opacity: !guestName.trim() || submitting ? 0.5 : 1,
            cursor: !guestName.trim() || submitting ? 'not-allowed' : 'pointer',
          }}
          onClick={handleSubmit}>
          {submitting ? t('join.connecting') : t('join.continueToDeviceCheck')}
        </button>

        {error && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 13 }}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
