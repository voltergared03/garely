'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  Gavel, Search, X, ArrowUpRight, AlertCircle, RotateCw, Sparkles,
  User, ChevronDown, Pencil, Trash2, Check, ChevronsDownUp, ChevronsUpDown, Loader2,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import { fmtDateLong } from '@/lib/utils';
import { useWorkspaceTz } from '@/hooks/use-workspace-tz';
import s from './page.module.css';

interface UserLite { id: string; name: string | null; image: string | null; }
interface DecisionMeeting { id: string; title: string; scheduledAt: string | null; }
interface Decision {
  id: string;
  text: string;
  date: string | null;
  ownerId: string | null;
  owner: UserLite | null;
  meetingId: string | null;
  reportId: string | null;
  source: string;
  meeting: DecisionMeeting | null;
  canEdit: boolean;
  createdAt: string;
}
interface Member { id: string; name: string | null; email?: string | null; image: string | null; }

const ALL = 'all';
const NONE = '__none__';

const STYLES = `
@keyframes dec-fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes dec-shimmer { 0% { background-position: -260px 0; } 100% { background-position: 260px 0; } }
.dec-reveal { opacity: 0; animation: dec-fadeUp .5s cubic-bezier(.16,1,.3,1) forwards; }
.dec-card { transition: border-color .15s ease, box-shadow .15s ease; }
.dec-head { transition: background .15s ease; cursor: pointer; }
.dec-head:hover { background: var(--surface-2); }
.dec-item { transition: background .12s ease; }
.dec-item:hover { background: color-mix(in oklab, var(--surface-2) 55%, transparent); }
.dec-item .dec-actions { opacity: .5; transition: opacity .12s ease; }
.dec-item:hover .dec-actions, .dec-item:focus-within .dec-actions { opacity: 1; }
/* touch devices have no hover — keep the edit/delete affordances visible */
@media (hover: none) { .dec-item .dec-actions { opacity: .9; } }
.dec-iconbtn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: var(--muted); cursor: pointer; transition: all .12s ease; }
.dec-iconbtn:hover { background: var(--surface); border-color: var(--border); color: var(--text); }
.dec-iconbtn.danger:hover { color: var(--danger-fg); border-color: color-mix(in oklab, var(--danger-fg) 40%, transparent); }
.dec-report-link { transition: color .15s ease; }
.dec-report-link:hover { color: var(--accent) !important; }
.dec-skel { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 37%, var(--surface) 63%); background-size: 460px 100%; animation: dec-shimmer 1.5s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .dec-reveal { animation: none; opacity: 1; } .dec-skel { animation: none; } }
`;

type Group = { meeting: DecisionMeeting | null; items: Decision[] };

export default function DecisionsPage() {
  const t = useTranslations('decisions');
  const locale = useLocale();
  const tz = useWorkspaceTz();

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [meetingFilter, setMeetingFilter] = useState<string>(ALL);
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const seeded = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [dRes, mRes] = await Promise.all([fetch('/api/decisions'), fetch('/api/users')]);
      if (!dRes.ok) throw new Error(String(dRes.status));
      setDecisions(await dRes.json());
      if (mRes.ok) setMembers(await mRes.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Seed: open the most-recent meeting once, on first load.
  useEffect(() => {
    if (seeded.current || !decisions.length) return;
    seeded.current = true;
    const firstMid = decisions.find((d) => d.meeting)?.meeting?.id;
    if (firstMid) setExpanded(new Set([firstMid]));
  }, [decisions]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const memberOptions = useMemo(
    () => [{ value: '', label: t('noOwner') }, ...members.map((m) => ({ value: m.id, label: m.name || m.email || m.id }))],
    [members, t],
  );

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

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const d of filtered) {
      const key = d.meeting?.id ?? NONE;
      let g = map.get(key);
      if (!g) { g = { meeting: d.meeting, items: [] }; map.set(key, g); }
      g.items.push(d);
    }
    return [...map.values()];
  }, [filtered]);

  const meetingCount = useMemo(() => new Set(decisions.map((d) => d.meeting?.id).filter(Boolean)).size, [decisions]);
  const filtersActive = query.trim() !== '' || meetingFilter !== ALL || ownerFilter !== ALL;
  const groupKey = (g: Group) => g.meeting?.id ?? NONE;
  const isOpen = (g: Group) => filtersActive || expanded.has(groupKey(g));
  const allOpen = groups.length > 0 && groups.every((g) => expanded.has(groupKey(g)));
  const hasFilters = filtersActive;

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(groups.map(groupKey)));
  const clearAll = () => { setQuery(''); setMeetingFilter(ALL); setOwnerFilter(ALL); };

  // ── mutations ──────────────────────────────────────────
  const applyUpdate = useCallback((u: { id: string; text: string; ownerId: string | null }) => {
    setDecisions((prev) => prev.map((d) => {
      if (d.id !== u.id) return d;
      const m = u.ownerId ? memberById.get(u.ownerId) : null;
      return { ...d, text: u.text, ownerId: u.ownerId, owner: m ? { id: m.id, name: m.name, image: m.image } : null };
    }));
  }, [memberById]);
  const removeDecision = useCallback((id: string) => setDecisions((prev) => prev.filter((d) => d.id !== id)), []);

  return (
    <div className={s.page}>
      <div className={`page-container ${s.container}`}>
        <style>{STYLES}</style>

        {/* ── Masthead ───────────────────────────────────── */}
        <header className={s.header}>
          <div aria-hidden className={s.headerGlow} />
          <div className={s.headerInner}>
            <div className={`mono ${s.kicker}`}>{t('kicker')}</div>
            <h1 className={s.title}>
              <span className={s.titleIcon}>
                <Gavel size={20} />
              </span>
              {t('pageTitle')}
            </h1>
            <p className={s.subtitle}>{t('subtitle')}</p>
            {!loading && !error && decisions.length > 0 && (
              <div className={`mono ${s.statsRow}`}>
                <span className={s.statPrimary}>{t('count', { count: decisions.length })}</span>
                <span className={s.statDivider}>/</span>
                <span>{t('statMeetings', { count: meetingCount })}</span>
              </div>
            )}
          </div>
        </header>

        {/* ── Sticky filter bar ──────────────────────────── */}
        <div className={s.filterBar}>
          <div className={`field ${s.searchField}`}>
            <Search size={15} className={s.searchIcon} />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} className={s.searchInput} />
            {query && <button onClick={() => setQuery('')} aria-label={t('clear')} className={s.clearBtn}><X size={14} /></button>}
          </div>
          <Select value={meetingFilter} onChange={setMeetingFilter} options={meetingOptions} icon={<Gavel size={13} className={s.iconMuted} />} className={s.selectMeeting} />
          <Select value={ownerFilter} onChange={setOwnerFilter} options={ownerOptions} icon={<User size={13} className={s.iconMuted} />} className={s.selectOwner} />
          {!filtersActive && groups.length > 1 && (
            <button onClick={toggleAll} className={`dec-iconbtn ${s.toggleBtn}`} title={allOpen ? t('collapseAll') : t('expandAll')}>
              {allOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
              <span className={s.toggleLabel}>{allOpen ? t('collapseAll') : t('expandAll')}</span>
            </button>
          )}
        </div>

        {/* ── Loading ────────────────────────────────────── */}
        {loading && (
          <div className={s.stack12}>
            {[0, 1, 2].map((i) => <div key={i} className={`dec-skel ${s.skelItem}`} style={{ opacity: 1 - i * 0.18 }} />)}
          </div>
        )}

        {/* ── Error ──────────────────────────────────────── */}
        {!loading && error && (
          <div className={s.errorWrap}>
            <AlertCircle size={40} className={s.errorIcon} />
            <div className={s.errorTitle}>{t('loadError')}</div>
            <button className={`btn ${s.retryBtn}`} onClick={() => void load()}><RotateCw size={14} /> {t('retry')}</button>
          </div>
        )}

        {/* ── Empty ──────────────────────────────────────── */}
        {!loading && !error && filtered.length === 0 && (
          <div className={s.emptyWrap}>
            <div className={s.emptyIcon}>
              <Gavel size={28} />
            </div>
            <div className={s.emptyTitle}>{hasFilters ? t('emptyFilteredTitle') : t('emptyTitle')}</div>
            <div className={s.emptyDesc}>{hasFilters ? t('emptyFilteredDesc') : t('emptyDesc')}</div>
            {hasFilters && <button className={`btn ${s.clearFiltersBtn}`} onClick={clearAll}><X size={14} /> {t('clearFilters')}</button>}
          </div>
        )}

        {/* ── Accordion of meeting cards ─────────────────── */}
        {!loading && !error && filtered.length > 0 && (
          <div className={s.stack12}>
            {groups.map((g, gi) => (
              <MeetingCard
                key={groupKey(g)}
                group={g}
                open={isOpen(g)}
                onToggle={() => toggle(groupKey(g))}
                reveal={!filtersActive && gi < 12}
                revealDelay={gi * 45}
                members={members}
                memberOptions={memberOptions}
                memberById={memberById}
                locale={locale}
                tz={tz}
                t={t}
                onUpdated={applyUpdate}
                onDeleted={removeDecision}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Meeting card (collapsible) ─────────────────────────── */
function MeetingCard({
  group, open, onToggle, reveal, revealDelay, members, memberOptions, memberById, locale, tz, t, onUpdated, onDeleted,
}: {
  group: Group; open: boolean; onToggle: () => void; reveal: boolean; revealDelay: number;
  members: Member[]; memberOptions: { value: string; label: string }[]; memberById: Map<string, Member>;
  locale: string; tz: string; t: ReturnType<typeof useTranslations>;
  onUpdated: (u: { id: string; text: string; ownerId: string | null }) => void;
  onDeleted: (id: string) => void;
}) {
  const m = group.meeting;
  const date = m?.scheduledAt ?? group.items[0]?.date ?? null;
  return (
    <div className={`dec-card ${reveal ? 'dec-reveal' : ''} ${s.card}`} style={{ animationDelay: reveal ? `${revealDelay}ms` : undefined }}>
      {/* header (toggles) */}
      <div className={`dec-head ${s.head}`} role="button" tabIndex={0} aria-expanded={open} onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}>
        <span className={s.headIcon}>
          <Gavel size={15} />
        </span>
        <div className={s.grow}>
          <div className={s.headTitle}>
            {m ? (m.title || t('untitledMeeting')) : t('untitledMeeting')}
          </div>
          <div className={`mono ${s.headMeta}`}>
            {date ? fmtDateLong(new Date(date), locale, tz) : ''}{date ? ' · ' : ''}{t('count', { count: group.items.length })}
          </div>
        </div>
        {m && (
          <Link href={`/meetings/${m.id}/report`} className={`dec-report-link ${s.reportLink}`} onClick={(e) => e.stopPropagation()} title={t('openReport')}>
            <ArrowUpRight size={17} />
          </Link>
        )}
        <ChevronDown size={18} className={s.chevron} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>

      {/* body */}
      {open && (
        <div className={s.body}>
          {group.items.map((d, i) => (
            <DecisionItem
              key={d.id}
              d={d}
              last={i === group.items.length - 1}
              members={members}
              memberOptions={memberOptions}
              memberById={memberById}
              t={t}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── A single decision (view / edit / delete) ──────────── */
function DecisionItem({
  d, last, members, memberOptions, memberById, t, onUpdated, onDeleted,
}: {
  d: Decision; last: boolean;
  members: Member[]; memberOptions: { value: string; label: string }[]; memberById: Map<string, Member>;
  t: ReturnType<typeof useTranslations>;
  onUpdated: (u: { id: string; text: string; ownerId: string | null }) => void;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');
  const [text, setText] = useState(d.text);
  const [ownerId, setOwnerId] = useState(d.ownerId ?? '');
  const [busy, setBusy] = useState(false);

  const startEdit = () => { setText(d.text); setOwnerId(d.ownerId ?? ''); setMode('edit'); };

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/decisions/${d.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: trimmed, ownerId: ownerId || null }),
      });
      if (res.ok) { onUpdated(await res.json()); setMode('view'); }
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/decisions/${d.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(d.id);
    } finally { setBusy(false); }
  };

  const owner = d.ownerId ? memberById.get(d.ownerId) ?? d.owner : null;

  if (mode === 'edit') {
    return (
      <div className={s.editWrap} style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          autoFocus
          className={`field ${s.textarea}`}
        />
        <div className={s.editRow}>
          <Select value={ownerId} onChange={setOwnerId} options={memberOptions} placeholder={t('setOwner')} icon={<User size={13} className={s.iconMuted} />} className={s.selectOwnerEdit} />
          <div className={s.spacer} />
          <button className="btn btn-ghost" onClick={() => setMode('view')} disabled={busy}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !text.trim()}>
            {busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />} {t('save')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`dec-item ${s.item}`} style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span className={s.dot} />
      <div className={s.grow}>
        <p className={s.text}>{d.text}</p>
        <div className={s.metaRow}>
          {owner ? (
            <span className={s.ownerChip}>
              <Avatar name={owner.name || ''} image={owner.image} size="sm" />
              <span className={s.ownerName}>{owner.name || t('unknownOwner')}</span>
            </span>
          ) : (
            <span className={s.noOwner}>{t('noOwner')}</span>
          )}
          {d.source === 'ai' && (
            <span className={s.aiBadge}>
              <Sparkles size={10} /> {t('aiBadge')}
            </span>
          )}
        </div>

        {mode === 'confirm' && (
          <div className={s.confirmBar}>
            <span className={s.confirmText}>{t('confirmDelete')}</span>
            <button className={`btn btn-ghost ${s.smallBtn}`} onClick={() => setMode('view')} disabled={busy}>{t('cancel')}</button>
            <button className={`btn ${s.smallBtn}`} onClick={doDelete} disabled={busy} style={{ background: '#dc2626', borderColor: '#dc2626', color: 'var(--on-accent)' }}>
              {busy ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />} {t('delete')}
            </button>
          </div>
        )}
      </div>

      {d.canEdit && mode === 'view' && (
        <div className={`dec-actions ${s.actions}`}>
          <button className="dec-iconbtn" onClick={startEdit} aria-label={t('edit')} title={t('edit')}><Pencil size={14} /></button>
          <button className="dec-iconbtn danger" onClick={() => setMode('confirm')} aria-label={t('delete')} title={t('delete')}><Trash2 size={14} /></button>
        </div>
      )}
    </div>
  );
}
