'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { Link2, Video, Globe, ChevronLeft, AlertCircle } from 'lucide-react';
import { AvatarStack } from '@/components/ui/avatar';
import { Logo } from '@/components/ui/logo';
import s from './page.module.css';

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
  const { data: session } = useSession();
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
          } else if (res.status === 410) {
            const d = await res.json().catch(() => ({}));
            setError(d.reason === 'ended' ? t('join.errorEnded') : t('join.errorCancelled'));
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
      <div className={s.fixedCenter}>
        <div className={s.spinner} />
      </div>
    );
  }

  if (error && !meeting) {
    return (
      <div className={s.errorWrap}>
        <AlertCircle size={36} className={s.errorIcon} />
        <p className={s.errorText}>{error}</p>
        <button className={`btn ${s.homeBtn}`} onClick={() => router.push('/')}>
          {t('join.goHome')}
        </button>
      </div>
    );
  }

  if (!meeting) return null;

  // ---------- landing step ----------
  if (step === 'landing') {
    return (
      <div className={s.landingBg}>
        <div className={s.logoWrap}>
          <Logo size={18} />
        </div>

        <div className={s.centerWrap}>
          <div className={`card fade-in ${s.cardLanding}`}>
            <div className={s.topRow}>
              <span className="chip">
                <Link2 size={12} />
                {t('join.guestInvitation')}
              </span>
              <span className={`mono ${s.tokenText}`}>
                {token.length > 16 ? token.slice(0, 16) + '...' : token}
              </span>
            </div>

            <h1 className={s.titleLanding}>
              {meeting.title}
            </h1>

            <p className={s.invitedByText}>
              {t.rich('join.invitedBy', {
                name: meeting.invitedBy,
                b: (chunks) => <span className={s.invitedByName}>{chunks}</span>,
              })}
            </p>
            {meeting.scheduledAt && (
              <p className={s.scheduledText}>
                {formatDate(meeting.scheduledAt)}, {formatTime(meeting.scheduledAt)}
              </p>
            )}

            {meeting.participants && meeting.participants.length > 0 && (
              <div className={s.participantsBox}>
                <div className={s.participantsLeft}>
                  <AvatarStack users={meeting.participants} max={4} size="sm" />
                  <span className={s.participantsCount}>
                    {t('join.participantsCount', { count: meeting.participantCount })}
                  </span>
                </div>
                <Video size={16} className={s.mutedIcon} />
              </div>
            )}

            {session?.user ? (
              /* Signed-in colleague: skip the guest flow and go straight to the
                 lobby for THIS meeting (same id → same room as everyone else). */
              <button className={`btn btn-primary ${s.btnPrimaryFull}`} onClick={() => router.push(`/lobby/${meeting.id}`)}>
                <Video size={15} />
                {t('join.joinMeeting')}
              </button>
            ) : (
              <>
                <button className={`btn btn-primary ${s.btnPrimaryFullMb10}`} onClick={() => setStep('name')}>
                  {t('join.joinAsGuest')}
                </button>

                <button className={`btn ${s.btnFullMb24}`} onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent(`/lobby/${meeting.id}`)}`)}>
                  <Globe size={15} />
                  {t('join.loginWithGoogle')}
                </button>

                <div className={s.warningBox}>
                  <AlertCircle size={15} className={s.warningIcon} />
                  <span className={s.warningText}>
                    {t('join.tokenWarning')}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- name step ----------
  return (
    <div className={s.nameBg}>
      <div className={`card fade-in ${s.cardName}`}>
        <button className={`btn btn-ghost btn-sm ${s.backBtn}`}
          onClick={() => setStep('landing')}>
          <ChevronLeft size={15} />
          {t('common.back')}
        </button>

        <h1 className={s.titleName}>
          {t('join.howToIntroduce')}
        </h1>
        <p className={s.subtitle}>
          {t('join.introduceSubtitle')}
        </p>

        <div className={s.fieldWrap18}>
          <label className="field-label">
            {t('join.nameLabel')} <span className={s.requiredStar}>*</span>
          </label>
          <input className="field" type="text" placeholder={t('join.namePlaceholder')}
            value={guestName} onChange={(e) => setGuestName(e.target.value)} autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
        </div>

        <div className={s.fieldWrap6}>
          <label className="field-label">
            {t('join.emailLabel')} <span className={s.optionalLabel}>{t('join.optional')}</span>
          </label>
          <input className="field" type="email" placeholder="email@example.com"
            value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
        </div>
        <p className={s.emailHint}>
          {t('join.emailHint')}
        </p>

        <button className={`btn btn-primary ${s.submitBtn}`} disabled={!guestName.trim() || submitting}
          style={{
            opacity: !guestName.trim() || submitting ? 0.5 : 1,
            cursor: !guestName.trim() || submitting ? 'not-allowed' : 'pointer',
          }}
          onClick={handleSubmit}>
          {submitting ? t('join.connecting') : t('join.continueToDeviceCheck')}
        </button>

        {error && (
          <div className={s.errorRow}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
