'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Server as ServerIcon, Plus, Pencil, Trash2, ShieldCheck, MonitorPlay, Loader2, Building2,
} from 'lucide-react';
import { ServerFormModal } from './components/ServerFormModal';
import { AccessModal } from './components/AccessModal';
import type { ServerView, OrgMember, DeptLite } from './lib/types';

const STYLES = `
@keyframes srv-fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.srv-reveal { opacity: 0; animation: srv-fadeUp .45s cubic-bezier(.16,1,.3,1) forwards; }
.srv-card { transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease; }
.srv-card:hover { border-color: color-mix(in oklab, var(--accent) 45%, var(--border)); box-shadow: 0 8px 28px rgba(0,0,0,.18); }
.srv-act { opacity: .55; transition: opacity .12s ease; }
.srv-card:hover .srv-act { opacity: 1; }
.spin { animation: srv-spin 1s linear infinite; }
@keyframes srv-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .srv-reveal { animation: none; opacity: 1; } .spin { animation: none; } }
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
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>
      <style>{STYLES}</style>

      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ margin: 0, fontSize: 24, display: 'flex', alignItems: 'center', gap: 9 }}>
            <ServerIcon size={22} style={{ color: 'var(--accent)' }} /> {t('title')}
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 14 }}>{t('subtitle')}</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setFormFor(null)} style={{ fontWeight: 600 }}>
            <Plus size={16} /> {t('newServer')}
          </button>
        )}
      </header>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 132, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', opacity: 0.5 }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          {tc('loadError')}{' '}
          <button className="btn" onClick={() => void load()} style={{ marginLeft: 8 }}>{tc('retry')}</button>
        </div>
      ) : servers.length === 0 ? (
        <div style={{ padding: '56px 20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 16 }}>
          <ServerIcon size={34} style={{ color: 'var(--muted)', marginBottom: 10 }} />
          <div style={{ fontSize: 16, fontWeight: 600 }}>{canManage ? t('emptyAdminTitle') : t('emptyMemberTitle')}</div>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6, maxWidth: 420, marginInline: 'auto' }}>
            {canManage ? t('emptyAdminBody') : t('emptyMemberBody')}
          </div>
          {canManage && (
            <button className="btn btn-primary" onClick={() => setFormFor(null)} style={{ marginTop: 16, fontWeight: 600 }}>
              <Plus size={16} /> {t('newServer')}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {servers.map((s, i) => (
            <div
              key={s.id}
              className="srv-card srv-reveal"
              style={{
                animationDelay: `${Math.min(i, 8) * 45}ms`,
                border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)',
                padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in oklab, var(--accent) 16%, transparent)', color: 'var(--accent)' }}>
                  <ServerIcon size={19} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', fontFamily: 'var(--font-mono, ui-monospace, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.host}:{s.port}
                  </div>
                </div>
                {canManage && (
                  <div className="srv-act" style={{ display: 'flex', gap: 2 }}>
                    <button className="btn btn-ghost" style={{ padding: 6 }} title={tc('edit')} onClick={() => setFormFor(s)}><Pencil size={15} /></button>
                    <button className="btn btn-ghost" style={{ padding: 6 }} title={t('manageAccess')} onClick={() => setAccessFor(s)}><ShieldCheck size={15} /></button>
                    <button className="btn btn-ghost" style={{ padding: 6, color: 'var(--muted)' }} title={tc('delete')} disabled={deletingId === s.id} onClick={() => void del(s.id)}>
                      {deletingId === s.id ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
                <span style={{ padding: '3px 8px', borderRadius: 7, background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                  {s.domain ? `${s.domain}\\${s.username}` : s.username}
                </span>
                <span style={{ padding: '3px 8px', borderRadius: 7, background: 'var(--surface-2)', color: 'var(--text-2)', textTransform: 'uppercase' }}>{s.protocol}</span>
                {canManage && typeof s.accessCount === 'number' && (
                  <span style={{ padding: '3px 8px', borderRadius: 7, background: 'var(--surface-2)', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Building2 size={12} /> {t('grantsCount', { count: s.accessCount })}
                  </span>
                )}
              </div>

              <Link
                href={`/servers/${s.id}/session`}
                className="btn btn-primary"
                style={{ justifyContent: 'center', fontWeight: 600, textDecoration: 'none', marginTop: 'auto' }}
              >
                <MonitorPlay size={16} /> {t('connect')}
              </Link>
            </div>
          ))}
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
  );
}
