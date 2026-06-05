'use client';

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { ChevronLeft, Plus, Table2, MoreHorizontal, Pencil, Trash2, Share2, Lock } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { GridView } from '../components/GridView';
import { ShareModal } from '../components/ShareModal';
import { CHOICE_COLORS, type BaseDetail, type TableTab, type TableT, type RowT, type OrgMember, type FieldType } from '../lib/types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default function BaseDetailPage() {
  const t = useTranslations('database');
  const tc = useTranslations('common');
  const router = useRouter();
  const { baseId } = useParams<{ baseId: string }>();

  const [base, setBase] = useState<BaseDetail | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [table, setTable] = useState<TableT | null>(null);
  const [rows, setRows] = useState<RowT[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [newTableOpen, setNewTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [tableErr, setTableErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [renameBaseOpen, setRenameBaseOpen] = useState(false);
  const [renameBaseVal, setRenameBaseVal] = useState('');
  const [confirmDelBase, setConfirmDelBase] = useState(false);
  const [renameTableT, setRenameTableT] = useState<TableTab | null>(null);
  const [renameTableVal, setRenameTableVal] = useState('');
  const [delTableT, setDelTableT] = useState<TableTab | null>(null);

  useEffect(() => {
    (async () => {
      const [bRes, mRes] = await Promise.all([fetch(`/api/bases/${baseId}`), fetch('/api/org/members')]);
      if (bRes.ok) {
        const b: BaseDetail = await bRes.json();
        setBase(b);
        setActiveTableId(b.tables[0]?.id ?? null);
      }
      if (mRes.ok) setMembers(await mRes.json());
      setLoading(false);
    })();
  }, [baseId]);

  const loadTable = useCallback(async (tableId: string) => {
    const tRes = await fetch(`/api/tables/${tableId}`);
    if (!tRes.ok) return;
    const tbl: TableT = await tRes.json();
    setTable(tbl);
    const vId = tbl.views[0]?.id;
    const rRes = await fetch(`/api/tables/${tableId}/rows${vId ? `?view=${vId}` : ''}`);
    if (rRes.ok) {
      const d = await rRes.json();
      setRows((d.rows as RowT[]).map((r) => ({ ...r, data: r.data || {} })));
    } else setRows([]);
  }, []);

  useEffect(() => {
    if (activeTableId) { setTable(null); loadTable(activeTableId); }
  }, [activeTableId, loadTable]);

  const patchBase = (body: Record<string, unknown>) =>
    fetch(`/api/bases/${baseId}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });

  async function createTable() {
    const n = newTableName.trim();
    if (!n || busy) return;
    setBusy(true);
    setTableErr(null);
    const res = await fetch(`/api/bases/${baseId}/tables`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name: n }) });
    setBusy(false);
    if (res.ok) {
      const { table: newT } = await res.json();
      const tab: TableTab = { id: newT.id, name: newT.name, icon: newT.icon, position: newT.position, primaryFieldId: newT.primaryFieldId };
      setBase((b) => (b ? { ...b, tables: [...b.tables, tab] } : b));
      setNewTableOpen(false);
      setNewTableName('');
      setActiveTableId(newT.id);
    } else {
      setTableErr(t('actionFailed'));
    }
  }

  async function renameBase() {
    const nm = renameBaseVal.trim();
    if (!nm) return;
    setBase((b) => (b ? { ...b, name: nm } : b));
    setRenameBaseOpen(false);
    await patchBase({ name: nm });
  }
  async function recolorBase(color: string) {
    setBase((b) => (b ? { ...b, color } : b));
    await patchBase({ color });
  }
  async function deleteBase() {
    await fetch(`/api/bases/${baseId}`, { method: 'DELETE' });
    router.push('/database');
  }

  async function renameTable() {
    if (!renameTableT) return;
    const id = renameTableT.id;
    const nm = renameTableVal.trim();
    if (!nm) return;
    setBase((b) => (b ? { ...b, tables: b.tables.map((x) => (x.id === id ? { ...x, name: nm } : x)) } : b));
    setTable((t0) => (t0 && t0.id === id ? { ...t0, name: nm } : t0));
    setRenameTableT(null);
    await fetch(`/api/tables/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ name: nm }) });
  }
  async function deleteTable() {
    if (!delTableT) return;
    const id = delTableT.id;
    const remaining = (base?.tables ?? []).filter((x) => x.id !== id);
    setBase((b) => (b ? { ...b, tables: remaining } : b));
    setDelTableT(null);
    if (activeTableId === id) setActiveTableId(remaining[0]?.id ?? null);
    await fetch(`/api/tables/${id}`, { method: 'DELETE' });
  }

  // --- grid handlers (unchanged) ---
  async function reloadSchema() {
    if (!activeTableId) return;
    const res = await fetch(`/api/tables/${activeTableId}`);
    if (res.ok) { const tbl: TableT = await res.json(); setTable((t0) => (t0 ? { ...t0, fields: tbl.fields, primaryFieldId: tbl.primaryFieldId } : tbl)); }
  }
  async function addRow() {
    if (!activeTableId) return;
    const res = await fetch(`/api/tables/${activeTableId}/rows`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
    if (res.ok) { const row: RowT = await res.json(); setRows((rs) => [...rs, { ...row, data: row.data || {} }]); }
  }
  async function updateCell(rowId: string, fieldId: string, value: unknown) {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, data: { ...r.data, [fieldId]: value } } : r)));
    const res = await fetch(`/api/rows/${rowId}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ data: { [fieldId]: value } }) });
    if (res.ok) { const updated = await res.json(); setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, data: updated.data || {} } : r))); }
  }
  async function addField(name: string, type: FieldType, options?: unknown) {
    if (!activeTableId) return;
    const res = await fetch(`/api/tables/${activeTableId}/fields`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(options === undefined ? { name, type } : { name, type, options }) });
    if (res.ok) { const f = await res.json(); setTable((t0) => (t0 ? { ...t0, fields: [...t0.fields, f] } : t0)); }
  }
  async function editField(fieldId: string, patch: { name: string; type: FieldType; options?: unknown }) {
    setTable((t0) => (t0 ? { ...t0, fields: t0.fields.map((f) => (f.id === fieldId ? { ...f, name: patch.name, type: patch.type } : f)) } : t0));
    const res = await fetch(`/api/fields/${fieldId}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) });
    if (res.ok) { const f = await res.json(); setTable((t0) => (t0 ? { ...t0, fields: t0.fields.map((x) => (x.id === fieldId ? f : x)) } : t0)); }
  }
  async function deleteRow(rowId: string) { setRows((rs) => rs.filter((r) => r.id !== rowId)); await fetch(`/api/rows/${rowId}`, { method: 'DELETE' }); }
  async function deleteField(fieldId: string) { setTable((t0) => (t0 ? { ...t0, fields: t0.fields.filter((f) => f.id !== fieldId) } : t0)); await fetch(`/api/fields/${fieldId}`, { method: 'DELETE' }); reloadSchema(); }
  async function setPrimary(fieldId: string) { if (!activeTableId) return; setTable((t0) => (t0 ? { ...t0, primaryFieldId: fieldId } : t0)); await fetch(`/api/tables/${activeTableId}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ primaryFieldId: fieldId }) }); }
  async function resizeField(fieldId: string, width: number) { setTable((t0) => (t0 ? { ...t0, fields: t0.fields.map((f) => (f.id === fieldId ? { ...f, width } : f)) } : t0)); await fetch(`/api/fields/${fieldId}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ width }) }); }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={22} /></div>;
  if (!base) return <div style={{ padding: 40 }}><Link href="/database" className="btn btn-ghost"><ChevronLeft size={16} /> {t('title')}</Link></div>;

  const accent = base.color || '#3b82f6';
  const restricted = base.visibility === 'restricted';

  return (
    <div style={{ padding: '18px clamp(12px, 3vw, 28px)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Link href="/database" className="btn btn-ghost btn-icon" style={{ width: 32, height: 32 }}><ChevronLeft size={18} /></Link>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: accent, flexShrink: 0 }} />
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{base.name}</h1>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={() => setShareOpen(true)} style={{ fontWeight: 600, gap: 7 }}>
          {restricted ? <Lock size={15} /> : <Share2 size={15} />} {t('share')}
        </button>
        <PopMenu trigger={<MoreHorizontal size={18} />} label={t('menu')}>
          {(close) => (
            <>
              <MenuRow icon={<Pencil size={14} />} label={t('rename')} onClick={() => { close(); setRenameBaseVal(base.name); setRenameBaseOpen(true); }} />
              <MenuRow icon={<Share2 size={14} />} label={t('share')} onClick={() => { close(); setShareOpen(true); }} />
              <div style={{ display: 'flex', gap: 5, padding: '8px 10px 6px', flexWrap: 'wrap' }}>
                {CHOICE_COLORS.slice(0, 8).map((c) => (
                  <button key={c} onClick={() => recolorBase(c)} title={t('recolor')} style={{ width: 18, height: 18, borderRadius: 5, background: c, border: base.color === c ? '2px solid var(--text)' : '1px solid rgba(255,255,255,.12)', cursor: 'pointer' }} />
                ))}
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <MenuRow icon={<Trash2 size={14} />} label={t('deleteBase')} danger onClick={() => { close(); setConfirmDelBase(true); }} />
            </>
          )}
        </PopMenu>
      </div>

      {/* Table tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto', overflowY: 'hidden' }}>
        {base.tables.map((tab) => {
          const active = tab.id === activeTableId;
          return (
            <div key={tab.id} style={{ display: 'inline-flex', alignItems: 'center', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>
              <button
                onClick={() => setActiveTableId(tab.id)}
                style={{ border: 'none', background: 'transparent', padding: '8px 6px 8px 12px', cursor: 'pointer', fontSize: 13.5, fontWeight: active ? 700 : 500, color: active ? 'var(--text)' : 'var(--text-2)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Table2 size={14} /> {tab.name}
              </button>
              {active ? (
                <PopMenu trigger={<MoreHorizontal size={14} />} width={180} small label={t('menu')}>
                  {(close) => (
                    <>
                      <MenuRow icon={<Pencil size={14} />} label={t('renameTable')} onClick={() => { close(); setRenameTableVal(tab.name); setRenameTableT(tab); }} />
                      <MenuRow icon={<Trash2 size={14} />} label={t('deleteTable')} danger onClick={() => { close(); setDelTableT(tab); }} />
                    </>
                  )}
                </PopMenu>
              ) : (
                <span style={{ width: 8 }} />
              )}
            </div>
          );
        })}
        <button onClick={() => setNewTableOpen(true)} className="btn btn-ghost btn-icon" title={t('newTable')} style={{ width: 28, height: 28, marginLeft: 4 }}><Plus size={15} /></button>
      </div>

      {/* Body */}
      {base.tables.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{t('noTables')}</div>
          <button className="btn btn-primary" onClick={() => setNewTableOpen(true)} style={{ marginTop: 14 }}><Plus size={16} /> {t('newTable')}</button>
        </div>
      ) : !table ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={20} /></div>
      ) : (
        <GridView table={table} rows={rows} members={members} onCellChange={updateCell} onAddRow={addRow} onAddField={addField} onEditField={editField} onDeleteRow={deleteRow} onDeleteField={deleteField} onSetPrimary={setPrimary} onResizeField={resizeField} />
      )}

      {/* Modals */}
      <Modal open={newTableOpen} onClose={() => { setNewTableOpen(false); setTableErr(null); }} title={t('newTable')} width={420}>
        <label className="field-label">{t('tableName')}</label>
        <input className="field" autoFocus value={newTableName} onChange={(e) => setNewTableName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createTable()} placeholder={t('tableNamePlaceholder')} style={{ width: '100%', marginBottom: tableErr ? 8 : 18 }} />
        {tableErr && <div style={{ color: 'var(--red, #ef4444)', fontSize: 12.5, marginBottom: 14 }}>{tableErr}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setNewTableOpen(false)}>{tc('cancel')}</button>
          <button className="btn btn-primary" onClick={createTable} disabled={!newTableName.trim() || busy}>{busy ? <Spinner size={15} /> : t('createTable')}</button>
        </div>
      </Modal>

      <Modal open={renameBaseOpen} onClose={() => setRenameBaseOpen(false)} title={t('renameBaseTitle')} width={420}>
        <input className="field" autoFocus value={renameBaseVal} onChange={(e) => setRenameBaseVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && renameBase()} style={{ width: '100%', marginBottom: 18 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setRenameBaseOpen(false)}>{tc('cancel')}</button>
          <button className="btn btn-primary" onClick={renameBase} disabled={!renameBaseVal.trim()}>{tc('save')}</button>
        </div>
      </Modal>

      <Modal open={confirmDelBase} onClose={() => setConfirmDelBase(false)} title={t('deleteBase')} width={420}>
        <p style={{ margin: '0 0 18px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>{t('confirmDeleteBase')}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setConfirmDelBase(false)}>{tc('cancel')}</button>
          <button className="btn" onClick={deleteBase} style={{ background: 'var(--red, #ef4444)', color: '#fff', fontWeight: 600 }}>{t('deleteBase')}</button>
        </div>
      </Modal>

      <Modal open={!!renameTableT} onClose={() => setRenameTableT(null)} title={t('renameTable')} width={420}>
        <input className="field" autoFocus value={renameTableVal} onChange={(e) => setRenameTableVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && renameTable()} style={{ width: '100%', marginBottom: 18 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setRenameTableT(null)}>{tc('cancel')}</button>
          <button className="btn btn-primary" onClick={renameTable} disabled={!renameTableVal.trim()}>{tc('save')}</button>
        </div>
      </Modal>

      <Modal open={!!delTableT} onClose={() => setDelTableT(null)} title={t('deleteTable')} width={420}>
        <p style={{ margin: '0 0 18px', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>{t('confirmDeleteTable')}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setDelTableT(null)}>{tc('cancel')}</button>
          <button className="btn" onClick={deleteTable} style={{ background: 'var(--red, #ef4444)', color: '#fff', fontWeight: 600 }}>{t('deleteTable')}</button>
        </div>
      </Modal>

      {shareOpen && <ShareModal open={shareOpen} baseId={baseId} onClose={() => setShareOpen(false)} onVisibility={(v) => setBase((b) => (b ? { ...b, visibility: v } : b))} />}
    </div>
  );
}

function PopMenu({ trigger, width = 200, small, label, children }: { trigger: ReactNode; width?: number; small?: boolean; label?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); };
  }, [open]);
  return (
    <>
      <button
        ref={ref}
        aria-label={label}
        className="btn btn-ghost btn-icon"
        style={{ width: small ? 24 : 30, height: small ? 24 : 30, color: 'var(--muted)' }}
        onClick={(e) => { e.stopPropagation(); const r = ref.current!.getBoundingClientRect(); setPos({ left: r.right - width, top: r.bottom }); setOpen((o) => !o); }}
      >
        {trigger}
      </button>
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', left: Math.max(pos.left, 8), top: pos.top + 4, width, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 14px 44px rgba(0,0,0,.55)', padding: 6, zIndex: 2000 }}>
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

function MenuRow({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
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
