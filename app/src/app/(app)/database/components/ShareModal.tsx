'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Globe, Lock, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import type { OrgMember } from '../lib/types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
type Vis = 'org' | 'restricted';

export function ShareModal({
  open,
  baseId,
  onClose,
  onVisibility,
}: {
  open: boolean;
  baseId: string;
  onClose: () => void;
  onVisibility?: (v: Vis) => void;
}) {
  const t = useTranslations('database');
  const [loading, setLoading] = useState(true);
  const [visibility, setVisibility] = useState<Vis>('org');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    setEmail('');
    Promise.all([
      fetch(`/api/bases/${baseId}/members`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/org/members').then((r) => (r.ok ? r.json() : [])),
    ]).then(([m, om]) => {
      if (m) {
        setVisibility(m.visibility === 'restricted' ? 'restricted' : 'org');
        setOwnerId(m.ownerId ?? null);
        setCanManage(!!m.canManage);
        setMembers(m.members ?? []);
      }
      setOrgMembers(om ?? []);
      setLoading(false);
    });
  }, [open, baseId]);

  const owner = orgMembers.find((u) => u.id === ownerId) ?? null;

  async function setVis(v: Vis) {
    setVisibility(v);
    onVisibility?.(v);
    await fetch(`/api/bases/${baseId}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ visibility: v }) });
  }

  async function add() {
    const e = email.trim();
    if (!e || busy) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/bases/${baseId}/members`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ email: e }) });
    setBusy(false);
    if (res.ok) {
      const u: OrgMember = await res.json();
      setMembers((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]));
      setEmail('');
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error === 'not_in_workspace' ? t('notInWorkspace') : '—');
    }
  }

  async function removeMember(userId: string) {
    setMembers((prev) => prev.filter((x) => x.id !== userId));
    await fetch(`/api/bases/${baseId}/members/${userId}`, { method: 'DELETE' });
  }

  return (
    <Modal open={open} onClose={onClose} title={t('shareBase')} width={460}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner size={20} /></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <VisOption icon={<Globe size={15} />} title={t('accessOrgShort')} sub={t('accessOrg')} active={visibility === 'org'} disabled={!canManage} onClick={() => setVis('org')} />
            <VisOption icon={<Lock size={15} />} title={t('accessRestrictedShort')} sub={t('accessRestricted')} active={visibility === 'restricted'} disabled={!canManage} onClick={() => setVis('restricted')} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            {t('peopleWithAccess')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: canManage ? 14 : 0 }}>
            {owner && <PersonRow user={owner} badge={t('owner')} />}
            {members.filter((m) => m.id !== ownerId).map((m) => (
              <PersonRow key={m.id} user={m} onRemove={canManage ? () => removeMember(m.id) : undefined} />
            ))}
            {!owner && members.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: '6px 2px' }}>—</div>
            )}
          </div>

          {canManage && (
            <div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="field"
                  list="db-share-emails"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErr(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                  placeholder={t('addPersonPlaceholder')}
                  style={{ flex: 1 }}
                />
                <datalist id="db-share-emails">
                  {orgMembers.map((u) => (u.email ? <option key={u.id} value={u.email} /> : null))}
                </datalist>
                <button className="btn btn-primary" onClick={add} disabled={!email.trim() || busy}>
                  {busy ? <Spinner size={14} /> : t('addPerson')}
                </button>
              </div>
              {err && <div style={{ color: 'var(--red, #ef4444)', fontSize: 12, marginTop: 6 }}>{err}</div>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function VisOption({ icon, title, sub, active, disabled, onClick }: { icon: ReactNode; title: string; sub: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'var(--surface-2)',
        opacity: disabled && !active ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: active ? 'var(--accent)' : 'var(--text-2)', marginBottom: 3 }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</div>
    </button>
  );
}

function PersonRow({ user, badge, onRemove }: { user: OrgMember; badge?: string; onRemove?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
      <Avatar name={user.name || user.email || '?'} image={user.image} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || user.email}</div>
        {user.name && user.email && <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{user.email}</div>}
      </div>
      {badge && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{badge}</span>}
      {onRemove && (
        <button onClick={onRemove} className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} title="Remove">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
