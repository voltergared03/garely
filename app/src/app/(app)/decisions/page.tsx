'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Gavel, Search, X, Calendar as CalendarIcon, ArrowUpRight, AlertCircle, Loader2 } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { fmtDateLong } from '@/lib/utils';
import { useWorkspaceTz } from '@/hooks/use-workspace-tz';
import { useIsMobile } from '@/lib/use-is-mobile';

interface DecisionOwner { id: string; name: string | null; image: string | null; }
interface Decision {
  id: string;
  text: string;
  date: string | null;
  ownerId: string | null;
  owner: DecisionOwner | null;
  meetingId: string | null;
  reportId: string | null;
  source: string;
  meeting: { id: string; title: string; scheduledAt: string | null } | null;
  createdAt: string;
}

const ALL = 'all';

export default function DecisionsPage() {
  const t = useTranslations('decisions');
  const locale = useLocale();
  const tz = useWorkspaceTz();
  const isMobile = useIsMobile();

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [meetingFilter, setMeetingFilter] = useState<string>(ALL);
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/decisions');
      if (!res.ok) throw new Error(String(res.status));
      setDecisions(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Facets derived from the FULL accessible set (stable while filtering).
  const meetingOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of decisions) if (d.meeting) seen.set(d.meeting.id, d.meeting.title || t('untitledMeeting'));
    return [{ value: ALL, label: t('filterAllMeetings') }, ...[...seen].map(([value, label]) => ({ value, label }))];
  }, [decisions, t]);

  const ownerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    let hasNone = false;
    for (const d of decisions) {
      if (d.owner) seen.set(d.owner.id, d.owner.name || t('unknownOwner'));
      else hasNone = true;
    }
    const opts = [{ value: ALL, label: t('filterAllOwners') }, ...[...seen].map(([value, label]) => ({ value, label }))];
    if (hasNone) opts.push({ value: 'none', label: t('noOwner') });
    return opts;
  }, [decisions, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decisions.filter((d) => {
      if (meetingFilter !== ALL && d.meeting?.id !== meetingFilter) return false;
      if (ownerFilter === 'none' ? !!d.ownerId : ownerFilter !== ALL && d.ownerId !== ownerFilter) return false;
      if (q && !d.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [decisions, meetingFilter, ownerFilter, query]);

  const hasFilters = meetingFilter !== ALL || ownerFilter !== ALL || query.trim() !== '';

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: isMobile ? '4px 0 80px' : '4px 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: 'color-mix(in oklab, var(--accent) 16%, transparent)',
            color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Gavel size={19} />
          </span>
          {t('pageTitle')}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0 0', paddingLeft: 44 }}>
          {t('subtitle')}
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div
          className="field"
          style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}
        >
          <Search size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, minWidth: 0 }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('clear')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Select
          value={meetingFilter}
          onChange={setMeetingFilter}
          options={meetingOptions}
          icon={<CalendarIcon size={14} style={{ color: 'var(--muted)' }} />}
          style={{ minWidth: 150, flex: isMobile ? 1 : undefined }}
        />
        <Select
          value={ownerFilter}
          onChange={setOwnerFilter}
          options={ownerOptions}
          style={{ minWidth: 140, flex: isMobile ? 1 : undefined }}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 92, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.6 - i * 0.12 }} />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--muted)' }}>
          <AlertCircle size={40} style={{ opacity: 0.4 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 14 }}>{t('loadError')}</div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => void load()}>
            <Loader2 size={14} /> {t('retry')}
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 20px' }}>
          <Gavel size={44} style={{ color: 'var(--muted)', opacity: 0.3 }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 14 }}>
            {hasFilters ? t('emptyFilteredTitle') : t('emptyTitle')}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 380, margin: '8px auto 0' }}>
            {hasFilters ? t('emptyFilteredDesc') : t('emptyDesc')}
          </div>
          {hasFilters && (
            <button
              className="btn"
              style={{ marginTop: 16 }}
              onClick={() => { setQuery(''); setMeetingFilter(ALL); setOwnerFilter(ALL); }}
            >
              <X size={14} /> {t('clearFilters')}
            </button>
          )}
        </div>
      )}

      {/* List */}
      {!loading && !error && filtered.length > 0 && (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10, fontWeight: 500 }}>
            {t('count', { count: filtered.length })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((d) => (
              <DecisionCard key={d.id} d={d} locale={locale} tz={tz} t={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DecisionCard({
  d, locale, tz, t,
}: {
  d: Decision;
  locale: string;
  tz: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const dateStr = d.date ? fmtDateLong(new Date(d.date), locale, tz) : null;
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Decision text */}
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>
          <Gavel size={16} />
        </span>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: 'var(--text)', fontWeight: 500, whiteSpace: 'pre-wrap' }}>
          {d.text}
        </p>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingLeft: 28 }}>
        {/* Owner */}
        {d.owner ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-2)' }}>
            <Avatar name={d.owner.name || ''} image={d.owner.image} size="sm" />
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.owner.name || t('unknownOwner')}
            </span>
          </span>
        ) : (
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t('noOwner')}</span>
        )}

        {/* Date */}
        {dateStr && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--muted)' }}>
            <CalendarIcon size={13} /> {dateStr}
          </span>
        )}

        {/* Source meeting → report */}
        {d.meeting && (
          <Link
            href={`/meetings/${d.meeting.id}/report`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5,
              color: 'var(--accent)', textDecoration: 'none', marginLeft: 'auto',
              maxWidth: 280, overflow: 'hidden',
            }}
            title={d.meeting.title}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.meeting.title}</span>
            <ArrowUpRight size={13} style={{ flexShrink: 0 }} />
          </Link>
        )}
      </div>
    </div>
  );
}
