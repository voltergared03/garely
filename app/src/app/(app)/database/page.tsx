'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Database as DbIcon, Plus, Table2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import type { BaseSummary } from './lib/types';

const ACCENTS = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6'];

export default function DatabaseHome() {
  const t = useTranslations('database');
  const tc = useTranslations('common');
  const router = useRouter();
  const [bases, setBases] = useState<BaseSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/bases')
      .then((r) => (r.ok ? r.json() : []))
      .then(setBases)
      .catch(() => setBases([]));
  }, []);

  async function create() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const res = await fetch('/api/bases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n }),
    });
    setBusy(false);
    if (res.ok) {
      const b = await res.json();
      setOpen(false);
      setName('');
      router.push(`/database/${b.id}`);
    }
  }

  return (
    <div className="page-scroll" style={{ padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <DbIcon size={22} /> {t('title')}
          </h1>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{t('subtitle')}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)} style={{ fontWeight: 600 }}>
          <Plus size={16} /> {t('newBase')}
        </button>
      </div>

      {bases === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={22} />
        </div>
      ) : bases.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '56px 24px', marginTop: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'color-mix(in oklab, var(--accent) 16%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <DbIcon size={26} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{t('noBases')}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13, margin: '6px auto 18px', maxWidth: 380 }}>{t('noBasesHint')}</div>
          <button className="btn btn-primary" onClick={() => setOpen(true)} style={{ fontWeight: 600 }}>
            <Plus size={16} /> {t('createBase')}
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
            marginTop: 22,
          }}
        >
          {bases.map((b, i) => {
            const accent = b.color || ACCENTS[i % ACCENTS.length];
            return (
              <Link
                key={b.id}
                href={`/database/${b.id}`}
                className="card"
                style={{ padding: 16, textDecoration: 'none', color: 'inherit', display: 'block', transition: 'transform .12s, border-color .12s' }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `color-mix(in oklab, ${accent} 22%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Table2 size={20} style={{ color: accent }} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 3 }}>{t('tableCount', { count: b.tableCount })}</div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t('createBase')} width={420}>
        <label className="field-label">{t('baseName')}</label>
        <input
          className="field"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder={t('baseNamePlaceholder')}
          style={{ width: '100%', marginBottom: 18 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>{tc('cancel')}</button>
          <button className="btn btn-primary" onClick={create} disabled={!name.trim() || busy}>
            {busy ? <Spinner size={15} /> : t('createBase')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
