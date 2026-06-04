'use client';

import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { Database as DbIcon, Plus, Table2, MoreHorizontal, Pencil, Trash2, Share2, Lock } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { ShareModal } from './components/ShareModal';
import { CHOICE_COLORS, type BaseSummary } from './lib/types';

const ACCENTS = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#f97316'];
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const accentOf = (b: BaseSummary, i: number) => b.color || ACCENTS[i % ACCENTS.length];

export default function DatabaseHome() {
  const t = useTranslations('database');
  const tc = useTranslations('common');
  const router = useRouter();
  const [bases, setBases] = useState<BaseSummary[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<BaseSummary | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<BaseSummary | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/bases').then((r) => (r.ok ? r.json() : [])).then(setBases).catch(() => setBases([]));
  }, []);

  const patch = (id: string, body: Record<string, unknown>) =>
    fetch(`/api/bases/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });

  async function create() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const res = await fetch('/api/bases', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name: n }) });
    setBusy(false);
    if (res.ok) {
      const b = await res.json();
      setCreateOpen(false);
      setName('');
      router.push(`/database/${b.id}`);
    }
  }

  async function doRename() {
    if (!renameTarget || !renameVal.trim()) return;
    const id = renameTarget.id;
    const nm = renameVal.trim();
    setBases((bs) => bs && bs.map((b) => (b.id === id ? { ...b, name: nm } : b)));
    setRenameTarget(null);
    await patch(id, { name: nm });
  }

  async function recolor(b: BaseSummary, color: string) {
    setBases((bs) => bs && bs.map((x) => (x.id === b.id ? { ...x, color } : x)));
    await patch(b.id, { color });
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setBases((bs) => bs && bs.filter((b) => b.id !== id));
    setDeleteTarget(null);
    await fetch(`/api/bases/${id}`, { method: 'DELETE' });
  }

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 44px)', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 26 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
            Garely · {t('title')}
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{t('title')}</h1>
          <div style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 6 }}>{t('subtitle')}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)} style={{ fontWeight: 600, flexShrink: 0 }}>
          <Plus size={16} /> {t('newBase')}
        </button>
      </div>

      {bases === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 70 }}><Spinner size={22} /></div>
      ) : bases.length === 0 ? (
        <div
          style={{
            textAlign: 'center', padding: '64px 24px', borderRadius: 18, border: '1px dashed var(--border)',
            background: 'radial-gradient(120% 100% at 50% 0%, color-mix(in oklab, var(--accent) 7%, transparent), transparent 70%)',
          }}
        >
          <div style={{ width: 60, height: 60, borderRadius: 16, background: 'color-mix(in oklab, var(--accent) 16%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <DbIcon size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{t('noBases')}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13.5, margin: '8px auto 20px', maxWidth: 400 }}>{t('noBasesHint')}</div>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)} style={{ fontWeight: 600 }}>
            <Plus size={16} /> {t('createBase')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(238px, 1fr))', gap: 16 }}>
          {bases.map((b, i) => (
            <BaseCard
              key={b.id}
              base={b}
              accent={accentOf(b, i)}
              index={i}
              onOpen={() => router.push(`/database/${b.id}`)}
              onRename={() => { setRenameTarget(b); setRenameVal(b.name); }}
              onRecolor={(c) => recolor(b, c)}
              onShare={() => setShareId(b.id)}
              onDelete={() => setDeleteTarget(b)}
            />
          ))}
        </div>
      )}

      {/* Create */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('createBase')} width={420}>
        <label className="field-label">{t('baseName')}</label>
        <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder={t('baseNamePlaceholder')} style={{ width: '100%', marginBottom: 18 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>{tc('cancel')}</button>
          <button className="btn btn-primary" onClick={create} disabled={!name.trim() || busy}>{busy ? <Spinner size={15} /> : t('createBase')}</button>
        </div>
      </Modal>

      {/* Rename */}
      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title={t('renameBaseTitle')} width={420}>
        <input className="field" autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doRename()} style={{ width: '100%', marginBottom: 18 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setRenameTarget(null)}>{tc('cancel')}</button>
          <button className="btn btn-primary" onClick={doRename} disabled={!renameVal.trim()}>{tc('save')}</button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('deleteBase')} width={420}>
        <p style={{ margin: '0 0 18px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>{t('confirmDeleteBase')}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>{tc('cancel')}</button>
          <button className="btn" onClick={doDelete} style={{ background: 'var(--red, #ef4444)', color: '#fff', fontWeight: 600 }}>{t('deleteBase')}</button>
        </div>
      </Modal>

      {shareId && <ShareModal open={!!shareId} baseId={shareId} onClose={() => setShareId(null)} onVisibility={() => { /* refresh badge on next load */ }} />}
    </div>
  );
}

function BaseCard({
  base,
  accent,
  index,
  onOpen,
  onRename,
  onRecolor,
  onShare,
  onDelete,
}: {
  base: BaseSummary;
  accent: string;
  index: number;
  onOpen: () => void;
  onRename: () => void;
  onRecolor: (c: string) => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('database');
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener('scroll', close, true);
    document.addEventListener('mousedown', close);
    return () => { window.removeEventListener('scroll', close, true); document.removeEventListener('mousedown', close); };
  }, [menu]);

  const card: CSSProperties = {
    position: 'relative', cursor: 'pointer', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden',
    border: `1px solid ${hover ? 'var(--border-2, var(--border))' : 'var(--border)'}`,
    transform: hover ? 'translateY(-2px)' : 'none', boxShadow: hover ? '0 12px 32px -14px rgba(0,0,0,.55)' : 'none',
    transition: 'transform .14s, border-color .14s, box-shadow .14s', animation: 'fadeIn .35s ease both', animationDelay: `${index * 45}ms`,
  };

  return (
    <div style={card} onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
      <div style={{ padding: '15px 14px 15px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: `color-mix(in oklab, ${accent} 22%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Table2 size={20} style={{ color: accent }} />
          </div>
          <button
            ref={btnRef}
            className="btn btn-ghost btn-icon"
            style={{ width: 30, height: 30, opacity: hover || menu ? 1 : 0, transition: 'opacity .12s' }}
            onClick={(e) => {
              e.stopPropagation();
              const r = btnRef.current!.getBoundingClientRect();
              setPos({ left: r.right - 196, top: r.bottom });
              setMenu((m) => !m);
            }}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{base.name}</div>
        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
          <span>{t('tableCount', { count: base.tableCount })}</span>
          {base.visibility === 'restricted' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={11} /> {t('accessRestrictedShort')}</span>
          )}
        </div>
      </div>

      {menu && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', left: Math.max(pos.left, 8), top: pos.top + 4, width: 196, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 14px 44px rgba(0,0,0,.55)', padding: 6, zIndex: 2000 }}
          >
            <MenuRow icon={<Pencil size={14} />} label={t('rename')} onClick={() => { setMenu(false); onRename(); }} />
            <MenuRow icon={<Share2 size={14} />} label={t('share')} onClick={() => { setMenu(false); onShare(); }} />
            <div style={{ display: 'flex', gap: 5, padding: '8px 10px 6px', flexWrap: 'wrap' }}>
              {CHOICE_COLORS.slice(0, 8).map((c) => (
                <button key={c} onClick={() => { onRecolor(c); }} title={t('recolor')} style={{ width: 18, height: 18, borderRadius: 5, background: c, border: base.color === c ? '2px solid var(--text)' : '1px solid rgba(255,255,255,.12)', cursor: 'pointer' }} />
              ))}
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <MenuRow icon={<Trash2 size={14} />} label={t('deleteBase')} danger onClick={() => { setMenu(false); onDelete(); }} />
          </div>,
          document.body,
        )}
    </div>
  );
}

function MenuRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: danger ? 'var(--red, #ef4444)' : 'var(--text)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon} {label}
    </button>
  );
}
