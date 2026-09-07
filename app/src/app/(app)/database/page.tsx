'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { Database as DbIcon, Plus, Table2, MoreHorizontal, Pencil, Trash2, Share2, Lock } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { ShareModal } from './components/ShareModal';
import { CHOICE_COLORS, type BaseSummary } from './lib/types';
import s from './page.module.css';

const ACCENTS = ['var(--accent)', 'var(--success)', '#a855f7', 'var(--warn)', 'var(--pink)', 'var(--teal)', '#6366f1', '#f97316'];
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
  const [createErr, setCreateErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/bases').then((r) => (r.ok ? r.json() : [])).then(setBases).catch(() => setBases([]));
  }, []);

  const patch = (id: string, body: Record<string, unknown>) =>
    fetch(`/api/bases/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });

  async function create() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setCreateErr(null);
    const res = await fetch('/api/bases', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name: n }) });
    setBusy(false);
    if (res.ok) {
      const b = await res.json();
      setCreateOpen(false);
      setName('');
      router.push(`/database/${b.id}`);
    } else {
      setCreateErr(t('actionFailed'));
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
    <div className={s.page}>
      <div className={s.wrap}>
      <div className={s.headRow}>
        <div>
          <div className={`mono ${s.kicker}`}>
            Garely · {t('title')}
          </div>
          <h1 className={s.pageTitle}>{t('title')}</h1>
          <div className={s.subtitle}>{t('subtitle')}</div>
        </div>
        <button className={`btn btn-primary ${s.createBtn}`} onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> {t('newBase')}
        </button>
      </div>

      {bases === null ? (
        <div className={s.loadingRow}><Spinner size={22} /></div>
      ) : (
        <div className="db-bento">
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
          <GhostCard index={bases.length} label={bases.length === 0 ? t('createBase') : t('newBase')} onClick={() => setCreateOpen(true)} />
        </div>
      )}

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setCreateErr(null); }} title={t('createBase')} width={420}>
        <label className="field-label">{t('baseName')}</label>
        <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder={t('baseNamePlaceholder')} style={{ width: '100%', marginBottom: createErr ? 8 : 18 }} />
        {createErr && <div className={s.errText}>{createErr}</div>}
        <div className={s.rowEnd}>
          <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>{tc('cancel')}</button>
          <button className="btn btn-primary" onClick={create} disabled={!name.trim() || busy}>{busy ? <Spinner size={15} /> : t('createBase')}</button>
        </div>
      </Modal>

      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title={t('renameBaseTitle')} width={420}>
        <input className={`field ${s.fieldMb18}`} autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doRename()} />
        <div className={s.rowEnd}>
          <button className="btn btn-ghost" onClick={() => setRenameTarget(null)}>{tc('cancel')}</button>
          <button className="btn btn-primary" onClick={doRename} disabled={!renameVal.trim()}>{tc('save')}</button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('deleteBase')} width={420}>
        <p className={s.desc}>{t('confirmDeleteBase')}</p>
        <div className={s.rowEnd}>
          <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>{tc('cancel')}</button>
          <button className={`btn ${s.dangerBtn}`} onClick={doDelete}>{t('deleteBase')}</button>
        </div>
      </Modal>

      {shareId && <ShareModal open={!!shareId} baseId={shareId} onClose={() => setShareId(null)} />}
      </div>
    </div>
  );
}

function BaseCard({
  base, accent, index, onOpen, onRename, onRecolor, onShare, onDelete,
}: {
  base: BaseSummary; accent: string; index: number;
  onOpen: () => void; onRename: () => void; onRecolor: (c: string) => void; onShare: () => void; onDelete: () => void;
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

  const previews = (base.tables ?? []).slice(0, 4);
  const more = base.tableCount - previews.length;

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={s.card}
      style={{
        border: `1px solid ${hover ? 'var(--border-2, var(--border))' : 'var(--border)'}`,
        transform: hover ? 'translateY(-2px)' : 'none', boxShadow: hover ? '0 14px 36px -16px var(--overlay)' : 'none',
        animationDelay: `${index * 45}ms`,
      }}
    >
      <div className={s.accentBar} style={{ background: accent }} />
      <div className={s.cardBody}>
        <div className={s.cardHead}>
          <div className={s.iconWrap} style={{ background: `color-mix(in oklab, ${accent} 22%, transparent)` }}>
            <Table2 size={21} style={{ color: accent }} />
          </div>
          <button
            ref={btnRef}
            aria-label={t('menu')}
            className={`btn btn-ghost btn-icon ${s.menuBtn}`}
            style={{ opacity: hover || menu ? 1 : 0 }}
            onClick={(e) => { e.stopPropagation(); const r = btnRef.current!.getBoundingClientRect(); setPos({ left: r.right - 196, top: r.bottom }); setMenu((m) => !m); }}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>

        <div className={s.cardTitle}>{base.name}</div>

        <div className={s.chipsRow}>
          {previews.length === 0 ? (
            <span className={s.emptyChip}>—</span>
          ) : (
            previews.map((n, i) => (
              <span key={i} className={s.chip}><Table2 size={10} className={s.chipIcon} />{n || t('untitled')}</span>
            ))
          )}
          {more > 0 && <span className={`${s.chip} ${s.chipMuted}`}>+{more}</span>}
        </div>

        <div className={`mono ${s.metaRow}`}>
          <span>{t('tableCount', { count: base.tableCount })}</span>
          {base.visibility === 'restricted' && (
            <span className={s.lockRow}><Lock size={11} /> {t('accessRestrictedShort')}</span>
          )}
        </div>
      </div>

      {menu && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={s.menuPanel}
            style={{ position: 'fixed', left: Math.max(pos.left, 8), top: pos.top + 4 }}
          >
            <MenuRow icon={<Pencil size={14} />} label={t('rename')} onClick={() => { setMenu(false); onRename(); }} />
            <MenuRow icon={<Share2 size={14} />} label={t('share')} onClick={() => { setMenu(false); onShare(); }} />
            <div className={s.colorRow}>
              {CHOICE_COLORS.slice(0, 8).map((c) => (
                <button key={c} onClick={() => onRecolor(c)} title={t('recolor')} className={s.swatch} style={{ background: c, border: base.color === c ? '2px solid var(--text)' : '1px solid var(--hover-2)' }} />
              ))}
            </div>
            <div className={s.divider} />
            <MenuRow icon={<Trash2 size={14} />} label={t('deleteBase')} danger onClick={() => { setMenu(false); onDelete(); }} />
          </div>,
          document.body,
        )}
    </div>
  );
}

function GhostCard({ onClick, index, label }: { onClick: () => void; index: number; label: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={s.ghost}
      style={{
        border: `1.5px dashed ${hover ? 'var(--accent)' : 'var(--border)'}`,
        background: hover ? 'color-mix(in oklab, var(--accent) 7%, transparent)' : 'transparent',
        color: hover ? 'var(--accent)' : 'var(--muted)',
        animationDelay: `${index * 45}ms`,
      }}
    >
      <Plus size={24} />
      <span className={s.ghostLabel}>{label}</span>
    </button>
  );
}

function MenuRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={s.menuRow}
      style={{ color: danger ? 'var(--danger)' : 'var(--text)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon} {label}
    </button>
  );
}
