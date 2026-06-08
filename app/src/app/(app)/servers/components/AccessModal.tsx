'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { X, Loader2, UserPlus, Users, Trash2, ShieldCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';
import type { ServerView, OrgMember, DeptLite, Grant } from '../lib/types';

/** Admin: manage who can reach a server — per-user and per-department grants. */
export function AccessModal({
  server,
  members,
  departments,
  onClose,
  onChanged,
}: {
  server: ServerView;
  members: OrgMember[];
  departments: DeptLite[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations('servers');
  const tc = useTranslations('common');
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/access`);
      if (res.ok) setGrants((await res.json()).grants ?? []);
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => { void load(); }, [load]);

  const grantedUserIds = useMemo(() => new Set(grants.filter((g) => g.user).map((g) => g.user!.id)), [grants]);
  const grantedDeptIds = useMemo(() => new Set(grants.filter((g) => g.department).map((g) => g.department!.id)), [grants]);

  const userOptions = [
    { value: '', label: t('addUser') },
    ...members.filter((m) => !grantedUserIds.has(m.id)).map((m) => ({ value: m.id, label: m.name || m.email || m.id })),
  ];
  const deptOptions = [
    { value: '', label: t('addDepartment') },
    ...departments.filter((d) => !grantedDeptIds.has(d.id)).map((d) => ({ value: d.id, label: d.name })),
  ];

  const grant = async (body: { userId?: string; departmentId?: string }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { await load(); onChanged(); }
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grantId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/access?grantId=${grantId}`, { method: 'DELETE' });
      if (res.ok) { setGrants((gs) => gs.filter((g) => g.id !== grantId)); onChanged(); }
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.5)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <ShieldCheck size={18} style={{ color: 'var(--accent)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{t('manageAccess')}</h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.name}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: 6 }} aria-label={tc('cancel')}><X size={18} /></button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserPlus size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <Select value="" onChange={(v) => v && grant({ userId: v })} options={userOptions} disabled={busy} style={{ flex: 1 }} />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <Select value="" onChange={(v) => v && grant({ departmentId: v })} options={deptOptions} disabled={busy} style={{ flex: 1 }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, padding: 10 }}>
                <Loader2 size={15} className="spin" /> {tc('loading')}
              </div>
            ) : grants.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: '10px 4px' }}>{t('noGrants')}</div>
            ) : (
              grants.map((g) => (
                <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, background: 'var(--surface-2)' }}>
                  {g.user ? (
                    <>
                      <Avatar name={g.user.name || g.user.email || '?'} image={g.user.image} size="sm" />
                      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.user.name || g.user.email}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ width: 26, height: 26, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: g.department?.color || 'var(--accent)', color: '#fff', flexShrink: 0 }}>
                        <Users size={14} />
                      </span>
                      <span style={{ flex: 1, fontSize: 13 }}>{g.department?.name} <span style={{ color: 'var(--muted)', fontSize: 11 }}>· {t('department')}</span></span>
                    </>
                  )}
                  <button onClick={() => revoke(g.id)} disabled={busy} className="btn btn-ghost" style={{ padding: 6, color: 'var(--muted)' }} aria-label={tc('delete')}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="btn btn-primary">{tc('done')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
