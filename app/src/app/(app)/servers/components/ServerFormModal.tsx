'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { X, Loader2, Server as ServerIcon } from 'lucide-react';
import { Select } from '@/components/ui/select';
import type { ServerView, DeptLite } from '../lib/types';

/** Create / edit a ServerConnection. Password is write-only: on edit it stays blank
 *  and is only sent when the admin types a new one ("leave blank to keep"). */
export function ServerFormModal({
  initial,
  departments,
  onClose,
  onSaved,
}: {
  initial: ServerView | null;
  departments: DeptLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('servers');
  const tc = useTranslations('common');
  const editing = !!initial;

  const [name, setName] = useState(initial?.name ?? '');
  const [host, setHost] = useState(initial?.host ?? '');
  const [port, setPort] = useState(String(initial?.port ?? 3389));
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState(initial?.domain ?? '');
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deptOptions = [{ value: '', label: t('noDepartment') }, ...departments.map((d) => ({ value: d.id, label: d.name }))];

  const save = async () => {
    setError(null);
    if (!name.trim() || !host.trim() || !username.trim()) {
      setError(t('errRequired'));
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        host: host.trim(),
        port: Number(port) || 3389,
        username: username.trim(),
        domain: domain.trim() || null,
        departmentId: departmentId || null,
      };
      if (password) body.password = password; // only set when typed
      const res = await fetch(editing ? `/api/servers/${initial!.id}` : '/api/servers', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      onSaved();
    } catch {
      setError(t('errSave'));
      setSaving(false);
    }
  };

  const field: React.CSSProperties = {
    width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none',
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, display: 'block' };

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 460, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.5)', maxHeight: '90vh', overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <ServerIcon size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: 0, fontSize: 16, flex: 1 }}>{editing ? t('editServer') : t('newServer')}</h3>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: 6 }} aria-label={tc('cancel')}><X size={18} /></button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label}>{t('name')}</label>
            <input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Prod RDP #1" autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}>
              <label style={label}>{t('host')}</label>
              <input style={field} value={host} onChange={(e) => setHost(e.target.value)} placeholder="10.0.0.5" />
            </div>
            <div style={{ width: 96 }}>
              <label style={label}>{t('port')}</label>
              <input style={field} value={port} onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" />
            </div>
          </div>
          <div>
            <label style={label}>{t('username')}</label>
            <input style={field} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Administrator" autoComplete="off" />
          </div>
          <div>
            <label style={label}>{t('password')}</label>
            <input
              style={field}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={editing && initial?.hasSecret ? t('passwordKeep') : ''}
              autoComplete="new-password"
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t('passwordHint')}</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={label}>{t('domain')}</label>
              <input style={field} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="WORKGROUP" autoComplete="off" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>{t('department')}</label>
              <Select value={departmentId} onChange={setDepartmentId} options={deptOptions} />
            </div>
          </div>

          {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="btn" disabled={saving}>{tc('cancel')}</button>
          <button onClick={save} className="btn btn-primary" disabled={saving} style={{ minWidth: 100, justifyContent: 'center' }}>
            {saving ? <Loader2 size={16} className="spin" /> : tc('save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
