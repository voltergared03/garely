'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Gavel, Search, X, ArrowUpRight, AlertCircle, RotateCw, Sparkles, User } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { fmtDateLong } from '@/lib/utils';
import { useWorkspaceTz } from '@/hooks/use-workspace-tz';

interface DecisionOwner { id: string; name: string | null; image: string | null; }
interface DecisionMeeting { id: string; title: string; scheduledAt: string | null; }
interface Decision {
  id: string;
  text: string;
  date: string | null;
  ownerId: string | null;
  owner: DecisionOwner | null;
  meetingId: string | null;
  reportId: string | null;
  source: string;
  meeting: DecisionMeeting | null;
  createdAt: string;
}

const ALL = 'all';

/* Self-contained styles: hover states + entrance choreography can't be inlined.
   All class names are `dec-`-prefixed to avoid colliding with globals. */
const STYLES = `
@keyframes dec-fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes dec-shimmer { 0% { background-position: -260px 0; } 100% { background-position: 260px 0; } }
@keyframes dec-breathe { 0%, 100% { opacity: .35; } 50% { opacity: .7; } }
.dec-reveal { opacity: 0; animation: dec-fadeUp .55s cubic-bezier(.16,1,.3,1) forwards; }
.dec-entry { transition: transform .18s ease; }
.dec-entry:hover { transform: translateX(3px); }
.dec-entry:hover .dec-node { box-shadow: 0 0 0 4px var(--bg), 0 0 0 6px color-mix(in oklab, var(--accent) 35%, transparent); }
.dec-meeting-link { transition: color .15s ease; }
.dec-meeting-link:hover { color: var(--text) !important; }
.dec-meeting-link:hover .dec-arrow { transform: translate(2px,-2px); }
.dec-arrow { transition: transform .15s ease; }
.dec-node { transition: box-shadow .2s ease; }
.dec-skel { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 37%, var(--surface) 63%); background-size: 460px 100%; animation: dec-shimmer 1.5s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .dec-reveal { animation: none; opacity: 1; }
  .dec-skel { animation: none; }
}
`;

type Group = { meeting: DecisionMeeting | null; items: Decision[] };

export default function DecisionsPage() {
  const t = useTranslations('decisions');
  const locale = useLocale();
  const tz = useWorkspaceTz();

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

  // Facets from the FULL accessible set (stable while filtering).
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

  // Chapter the (newest-first) decisions by meeting, preserving order.
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const d of filtered) {
      const key = d.meeting?.id ?? '__none__';
      let g = map.get(key);
      if (!g) { g = { meeting: d.meeting, items: [] }; map.set(key, g); }
      g.items.push(d);
    }
    return [...map.values()];
  }, [filtered]);

  const meetingCount = useMemo(
    () => new Set(decisions.map((d) => d.meeting?.id).filter(Boolean)).size,
    [decisions],
  );

  const hasFilters = meetingFilter !== ALL || ownerFilter !== ALL || query.trim() !== '';
  const animate = !hasFilters; // stagger on the initial/cleared view; instant while filtering

  // Flatten chapters + entries into one ordered stream for the reveal cascade.
  const flat: ({ kind: 'chapter'; group: Group } | { kind: 'entry'; d: Decision; first: boolean; last: boolean })[] = [];
  for (const g of groups) {
    flat.push({ kind: 'chapter', group: g });
    g.items.forEach((d, i) => flat.push({ kind: 'entry', d, first: i === 0, last: i === g.items.length - 1 }));
  }

  const clearAll = () => { setQuery(''); setMeetingFilter(ALL); setOwnerFilter(ALL); };

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '0 0 96px', position: 'relative' }}>
      <style>{STYLES}</style>

      {/* ── Masthead ─────────────────────────────────────────── */}
      <header style={{ position: 'relative', paddingTop: 8, marginBottom: 22 }}>
        {/* soft accent glow behind the title */}
        <div
          aria-hidden
          style={{
            position: 'absolute', top: -40, left: -20, width: 320, height: 180,
            background: 'radial-gradient(60% 60% at 20% 30%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%)',
            filter: 'blur(8px)', pointerEvents: 'none', zIndex: 0,
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600, marginBottom: 10 }}>
            {t('kicker')}
          </div>
          <h1 style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 40, height: 40, borderRadius: 11, flexShrink: 0,
              background: 'linear-gradient(145deg, color-mix(in oklab, var(--accent) 26%, transparent), color-mix(in oklab, var(--accent) 8%, transparent))',
              border: '1px solid color-mix(in oklab, var(--accent) 30%, transparent)',
              color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Gavel size={21} />
            </span>
            {t('pageTitle')}
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: 15, lineHeight: 1.5, margin: '12px 0 0', maxWidth: 540 }}>
            {t('subtitle')}
          </p>
          {!loading && !error && decisions.length > 0 && (
            <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, fontSize: 12.5, color: 'var(--muted)' }}>
              <span style={{ color: 'var(--text-2)' }}>{t('count', { count: decisions.length })}</span>
              <span style={{ opacity: 0.4 }}>/</span>
              <span>{t('statMeetings', { count: meetingCount })}</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Sticky filter bar ────────────────────────────────── */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 6,
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          padding: '12px 0', marginBottom: 8,
          background: 'linear-gradient(var(--bg) 78%, transparent)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <div className="field" style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <Search size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, minWidth: 0 }}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label={t('clear')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
              <X size={14} />
            </button>
          )}
        </div>
        <Select value={meetingFilter} onChange={setMeetingFilter} options={meetingOptions} icon={<Gavel size={13} style={{ color: 'var(--muted)' }} />} style={{ minWidth: 150 }} />
        <Select value={ownerFilter} onChange={setOwnerFilter} options={ownerOptions} icon={<User size={13} style={{ color: 'var(--muted)' }} />} style={{ minWidth: 150 }} />
      </div>

      {/* ── Loading ──────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingLeft: 38 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="dec-skel" style={{ height: 14, width: `${78 - i * 9}%`, borderRadius: 6 }} />
              <div className="dec-skel" style={{ height: 11, width: 130, borderRadius: 6, opacity: 0.7 }} />
            </div>
          ))}
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────── */}
      {!loading && error && (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--muted)' }}>
          <AlertCircle size={40} style={{ opacity: 0.4 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 14 }}>{t('loadError')}</div>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => void load()}>
            <RotateCw size={14} /> {t('retry')}
          </button>
        </div>
      )}

      {/* ── Empty ────────────────────────────────────────────── */}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '72px 20px' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, margin: '0 auto',
            background: 'color-mix(in oklab, var(--accent) 10%, transparent)',
            border: '1px solid color-mix(in oklab, var(--accent) 22%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
          }}>
            <Gavel size={28} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, marginTop: 18 }}>
            {hasFilters ? t('emptyFilteredTitle') : t('emptyTitle')}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.55, maxWidth: 400, margin: '10px auto 0' }}>
            {hasFilters ? t('emptyFilteredDesc') : t('emptyDesc')}
          </div>
          {hasFilters && (
            <button className="btn" style={{ marginTop: 18 }} onClick={clearAll}>
              <X size={14} /> {t('clearFilters')}
            </button>
          )}
        </div>
      )}

      {/* ── The record (timeline spine, chaptered by meeting) ── */}
      {!loading && !error && filtered.length > 0 && (
        <div style={{ position: 'relative' }}>
          {/* continuous spine */}
          <div
            aria-hidden
            style={{
              position: 'absolute', left: 11, top: 12, bottom: 16, width: 2, borderRadius: 2,
              background: 'linear-gradient(180deg, color-mix(in oklab, var(--accent) 55%, transparent), var(--border) 35%, transparent)',
            }}
          />
          {(() => {
            let idx = -1;
            return flat.map((node) => {
              idx += 1;
              const revealStyle = animate
                ? { animationDelay: `${Math.min(idx, 16) * 45}ms` }
                : undefined;
              const revealClass = animate ? 'dec-reveal' : '';

              if (node.kind === 'chapter') {
                const m = node.group.meeting;
                const chapterDate = m?.scheduledAt ?? node.group.items[0]?.date ?? null;
                return (
                  <div
                    key={`c-${m?.id ?? '__none__'}`}
                    className={revealClass}
                    style={{ ...revealStyle, display: 'flex', gap: 14, alignItems: 'flex-start', marginTop: idx === 0 ? 4 : 28, marginBottom: 6 }}
                  >
                    <div style={{ width: 24, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 1 }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center',
                        background: 'var(--accent)', color: 'var(--bg)',
                        boxShadow: '0 0 0 4px var(--bg), 0 4px 12px color-mix(in oklab, var(--accent) 45%, transparent)',
                      }}>
                        <Gavel size={12} />
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                      {m ? (
                        <Link href={`/meetings/${m.id}/report`} className="dec-meeting-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text)', textDecoration: 'none', fontSize: 15.5, fontWeight: 650, maxWidth: '100%' }} title={m.title}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title || t('untitledMeeting')}</span>
                          <ArrowUpRight className="dec-arrow" size={15} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                        </Link>
                      ) : (
                        <span style={{ fontSize: 15.5, fontWeight: 650, color: 'var(--text-2)' }}>{t('untitledMeeting')}</span>
                      )}
                      <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 11.5, color: 'var(--muted)' }}>
                        {chapterDate && <span>{fmtDateLong(new Date(chapterDate), locale, tz)}</span>}
                        {chapterDate && <span style={{ opacity: 0.4 }}>·</span>}
                        <span>{t('count', { count: node.group.items.length })}</span>
                      </div>
                    </div>
                  </div>
                );
              }

              // entry
              const d = node.d;
              return (
                <div
                  key={`e-${d.id}`}
                  className={`dec-entry ${revealClass}`}
                  style={{ ...revealStyle, display: 'flex', gap: 14, alignItems: 'flex-start' }}
                >
                  <div style={{ width: 24, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 9 }}>
                    <span className="dec-node" style={{ width: 9, height: 9, borderRadius: '50%', border: '2px solid var(--accent)', background: 'var(--bg)', boxShadow: '0 0 0 4px var(--bg)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, padding: '8px 0 12px', borderBottom: node.last ? 'none' : '1px solid var(--border)' }}>
                    <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.55, color: 'var(--text)', fontWeight: 450, whiteSpace: 'pre-wrap' }}>
                      {d.text}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
                      {d.owner ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-2)' }}>
                          <Avatar name={d.owner.name || ''} image={d.owner.image} size="sm" />
                          <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.owner.name || t('unknownOwner')}
                          </span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>{t('noOwner')}</span>
                      )}
                      {d.source === 'ai' && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600,
                          letterSpacing: '0.04em', color: 'var(--accent)', padding: '2px 7px', borderRadius: 999,
                          background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
                          border: '1px solid color-mix(in oklab, var(--accent) 22%, transparent)',
                        }}>
                          <Sparkles size={10} /> {t('aiBadge')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
