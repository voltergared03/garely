'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Server as ServerIcon, Plus, Pencil, Trash2, ShieldCheck, ArrowRight, Loader2,
  Users as UsersIcon, Network, Building2,
} from 'lucide-react';
import { ServerFormModal } from './components/ServerFormModal';
import { AccessModal } from './components/AccessModal';
import type { ServerView, OrgMember, DeptLite } from './lib/types';
import s from './page.module.css';

const STYLES = `
@keyframes srv-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
@keyframes srv-shimmer { 0% { background-position: -340px 0; } 100% { background-position: 340px 0; } }
@keyframes srv-breathe { 0%,100% { opacity:.4; transform: scale(1); } 50% { opacity:1; transform: scale(1.35); } }
.srv-reveal { opacity: 0; animation: srv-up .52s cubic-bezier(.16,1,.3,1) forwards; }
.srv-node { position: relative; overflow: hidden; transition: transform .18s cubic-bezier(.16,1,.3,1), border-color .18s ease, box-shadow .18s ease; }
.srv-node:hover { transform: translateY(-3px); border-color: color-mix(in oklab, var(--accent) 55%, var(--border)); box-shadow: 0 16px 44px -16px color-mix(in oklab, var(--accent) 34%, transparent), inset 0 1px 0 rgba(255,255,255,.05); }
.srv-node:active { transform: translateY(-1px) scale(.995); }
.srv-rail { position:absolute; left:0; top:0; bottom:0; width:3px; background: var(--accent); opacity:.35; transition: opacity .18s ease; }
.srv-node:hover .srv-rail { opacity: 1; }
.srv-dot { animation: srv-breathe 2.6s ease-in-out infinite; }
.srv-connect .srv-arrow { transition: transform .2s cubic-bezier(.16,1,.3,1); }
.srv-node:hover .srv-connect .srv-arrow { transform: translateX(4px); }
.srv-act { opacity: 0; transform: translateY(-3px); transition: opacity .15s ease, transform .15s ease; }
.srv-node:hover .srv-act, .srv-node:focus-within .srv-act { opacity: 1; transform: none; }
@media (hover: none) { .srv-act { opacity: .85; transform: none; } }
.srv-skel { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 37%, var(--surface) 63%); background-size: 600px 100%; animation: srv-shimmer 1.4s ease-in-out infinite; border-radius: 16px; }
.srv-iconbtn { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:8px; border:1px solid transparent; background:transparent; color:var(--muted); cursor:pointer; transition: all .12s ease; }
.srv-iconbtn:hover { background: var(--surface-2); border-color: var(--border); color: var(--text); }
.srv-iconbtn:active { transform: scale(.92); }
.srv-iconbtn.danger:hover { color:var(--danger-fg); border-color: color-mix(in oklab, var(--danger-fg) 40%, transparent); }
.srv-cta { transition: transform .14s cubic-bezier(.16,1,.3,1), box-shadow .18s ease; }
.srv-cta:active { transform: translateY(1px) scale(.985); }
.spin { animation: srv-spin 1s linear infinite; }
@keyframes srv-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .srv-reveal, .srv-dot, .srv-skel, .spin { animation: none; opacity: 1; } .srv-node, .srv-connect .srv-arrow { transition: none; } }
`;

export default function ServersPage() {
  const t = useTranslations('servers');
  const tc = useTranslations('common');

  const [servers, setServers] = useState<ServerView[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [departments, setDepartments] = useState<DeptLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [formFor, setFormFor] = useState<ServerView | null | undefined>(undefined); // undefined=closed, null=new
  const [accessFor, setAccessFor] = useState<ServerView | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/servers');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setServers(data.servers ?? []);
      setCanManage(!!data.canManage);
      if (data.canManage) {
        const [mRes, dRes] = await Promise.all([fetch('/api/org/members'), fetch('/api/departments')]);
        if (mRes.ok) setMembers(await mRes.json());
        if (dRes.ok) setDepartments((await dRes.json()).map((d: DeptLite) => ({ id: d.id, name: d.name, color: d.color })));
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Live presence: silently refresh the server list every 25s (and when the tab
  // refocuses) so "in use by …" stays current without showing skeletons.
  useEffect(() => {
    const tick = async () => {
      try {
        const res = await fetch('/api/servers');
        if (!res.ok) return;
        const data = await res.json();
        setServers(data.servers ?? []);
      } catch {
        /* keep last-known on a transient failure */
      }
    };
    const id = setInterval(tick, 25_000);
    const onVis = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Compact "who's using this server right now" label for a card. null = free.
  const occupancyLabel = useCallback((sessions: ServerView['activeSessions']): string | null => {
    if (!sessions || sessions.length === 0) return null;
    const others = sessions.filter((s) => !s.isSelf);
    if (others.length === 0) return t('inUseByYou'); // only my own session
    const name = others[0].name?.trim() || t('someone');
    const extra = others.length - 1;
    return extra > 0 ? `${t('inUseBy', { name })} +${extra}` : t('inUseBy', { name });
  }, [t]);

  const del = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/servers/${id}`, { method: 'DELETE' });
      if (res.ok) setServers((s) => s.filter((x) => x.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.container}>
      <style>{STYLES}</style>

      {/* ── Editorial header: left title block, right stat + action ── */}
      <header className={s.header}>
        <div
          aria-hidden
          className={s.headerGlow}
        />
        <div className={s.headerRow}>
          <div className={s.headerTitleBlock}>
            <div className={s.kicker}>
              <Network size={14} /> RDP
            </div>
            <h1 className={s.title}>
              {t('title')}
            </h1>
            <p className={s.subtitle}>{t('subtitle')}</p>
          </div>

          <div className={s.statActionRow}>
            {!loading && !error && servers.length > 0 && (
              <div className={s.statBlock}>
                <div className={s.statNumber}>
                  {String(servers.length).padStart(2, '0')}
                </div>
                <div className={s.statLabel}>
                  {t('serverCount', { count: servers.length })}
                </div>
              </div>
            )}
            {canManage && (
              <button className={`btn btn-primary srv-cta ${s.fw650}`} onClick={() => setFormFor(null)}>
                <Plus size={16} /> {t('newServer')}
              </button>
            )}
          </div>
        </div>
        <div className={s.divider} />
      </header>

      {/* ── Loading skeletons (match card geometry) ── */}
      {loading ? (
        <div className={s.grid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`srv-skel ${s.skelCard}`} style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      ) : error ? (
        <div className={s.errorState}>
          <Network size={28} className={s.halfOpacity} />
          <div>{tc('loadError')}</div>
          <button className="btn srv-cta" onClick={() => void load()}>{tc('retry')}</button>
        </div>
      ) : servers.length === 0 ? (
        /* ── Composed empty state ── */
        <div
          className={s.emptyState}
        >
          <div aria-hidden className={s.emptyGlow} />
          <div className={s.relative}>
            <span className={s.emptyIcon}>
              <ServerIcon size={28} />
            </span>
            <div className={s.emptyTitle}>
              {canManage ? t('emptyAdminTitle') : t('emptyMemberTitle')}
            </div>
            <div className={s.emptyBody}>
              {canManage ? t('emptyAdminBody') : t('emptyMemberBody')}
            </div>
            {canManage && (
              <button className={`btn btn-primary srv-cta ${s.emptyCta}`} onClick={() => setFormFor(null)}>
                <Plus size={16} /> {t('newServer')}
              </button>
            )}
          </div>
        </div>
      ) : (
        /* ── Connection grid ── */
        <div className={s.grid}>
          {servers.map((srv, i) => {
            const identity = srv.domain ? `${srv.domain}\\${srv.username}` : srv.username;
            const occ = occupancyLabel(srv.activeSessions);
            const occByOthers = (srv.activeSessions ?? []).some((x) => !x.isSelf);
            return (
              <article
                key={srv.id}
                className={`srv-node srv-reveal ${s.card}`}
                style={{
                  animationDelay: `${Math.min(i, 10) * 50}ms`,
                }}
              >
                <span className="srv-rail" aria-hidden />

                {/* Row: status + name + admin actions */}
                <div className={s.cardHeadRow}>
                  <span className={s.cardIcon}>
                    <ServerIcon size={20} />
                    <span
                      className={`srv-dot ${s.statusDot}`}
                      aria-hidden
                    />
                  </span>
                  <div className={s.flexMinW0}>
                    <div className={s.cardName}>
                      {srv.name}
                    </div>
                    {/* address shown to admins only — members never see host:port */}
                    {srv.host && (
                      <div className={s.cardHost}>
                        {srv.host}<span className={s.halfOpacity}>:</span>{srv.port}
                      </div>
                    )}
                  </div>
                  {canManage && (
                    <div className={`srv-act ${s.cardActions}`}>
                      <button className="srv-iconbtn" title={tc('edit')} onClick={() => setFormFor(srv)}><Pencil size={15} /></button>
                      <button className="srv-iconbtn" title={t('manageAccess')} onClick={() => setAccessFor(srv)}><ShieldCheck size={15} /></button>
                      <button className="srv-iconbtn danger" title={tc('delete')} disabled={deletingId === srv.id} onClick={() => void del(srv.id)}>
                        {deletingId === srv.id ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Meta chips */}
                <div className={s.chipsRow}>
                  {srv.username && (
                    <span className={s.chipMono}>
                      {identity}
                    </span>
                  )}
                  <span className={s.chipOutline}>
                    {srv.protocol}
                  </span>
                  {canManage && typeof srv.accessCount === 'number' && (
                    <span className={s.chipCount}>
                      {srv.accessCount > 0 ? <UsersIcon size={12} /> : <Building2 size={12} />} {t('grantsCount', { count: srv.accessCount })}
                    </span>
                  )}
                </div>

                {/* Live presence — who's currently connected */}
                {occ && (
                  <div
                    className={s.occPill}
                    style={{
                      background: occByOthers ? 'color-mix(in oklab, var(--warn) 14%, transparent)' : 'var(--surface-2)',
                      color: occByOthers ? 'var(--warn)' : 'var(--muted)',
                      border: `1px solid ${occByOthers ? 'color-mix(in oklab, var(--warn) 35%, transparent)' : 'var(--border)'}`,
                    }}
                    title={occ}
                  >
                    <span
                      className={`srv-dot ${s.occDot}`}
                      aria-hidden
                      style={{ background: occByOthers ? 'var(--warn)' : 'var(--success)' }}
                    />
                    <span className={s.ellipsisText}>{occ}</span>
                  </div>
                )}

                {/* Connect */}
                <Link
                  href={`/servers/${srv.id}/session`}
                  className={`btn btn-primary srv-connect srv-cta ${s.connectBtn}`}
                >
                  {t('connect')} <ArrowRight size={16} className="srv-arrow" />
                </Link>
              </article>
            );
          })}
        </div>
      )}

      {formFor !== undefined && (
        <ServerFormModal
          initial={formFor}
          departments={departments}
          onClose={() => setFormFor(undefined)}
          onSaved={() => { setFormFor(undefined); void load(); }}
        />
      )}
      {accessFor && (
        <AccessModal
          server={accessFor}
          members={members}
          departments={departments}
          onClose={() => setAccessFor(null)}
          onChanged={() => void load()}
        />
      )}
      </div>
    </div>
  );
}
