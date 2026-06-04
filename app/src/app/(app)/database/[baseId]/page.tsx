'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Plus, Table2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { GridView } from '../components/GridView';
import type { BaseDetail, TableTab, TableT, RowT, OrgMember, FieldType } from '../lib/types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default function BaseDetailPage() {
  const t = useTranslations('database');
  const tc = useTranslations('common');
  const { baseId } = useParams<{ baseId: string }>();

  const [base, setBase] = useState<BaseDetail | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [table, setTable] = useState<TableT | null>(null);
  const [rows, setRows] = useState<RowT[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [busy, setBusy] = useState(false);

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
    } else {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (activeTableId) {
      setTable(null);
      loadTable(activeTableId);
    }
  }, [activeTableId, loadTable]);

  async function createTable() {
    const n = newTableName.trim();
    if (!n || busy) return;
    setBusy(true);
    const res = await fetch(`/api/bases/${baseId}/tables`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: n }),
    });
    setBusy(false);
    if (res.ok) {
      const { table: newT } = await res.json();
      const tab: TableTab = {
        id: newT.id, name: newT.name, icon: newT.icon, position: newT.position, primaryFieldId: newT.primaryFieldId,
      };
      setBase((b) => (b ? { ...b, tables: [...b.tables, tab] } : b));
      setNewTableOpen(false);
      setNewTableName('');
      setActiveTableId(newT.id);
    }
  }

  async function reloadSchema() {
    if (!activeTableId) return;
    const res = await fetch(`/api/tables/${activeTableId}`);
    if (res.ok) {
      const tbl: TableT = await res.json();
      setTable((t0) => (t0 ? { ...t0, fields: tbl.fields, primaryFieldId: tbl.primaryFieldId } : tbl));
    }
  }

  async function addRow() {
    if (!activeTableId) return;
    const res = await fetch(`/api/tables/${activeTableId}/rows`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
    if (res.ok) {
      const row: RowT = await res.json();
      setRows((rs) => [...rs, { ...row, data: row.data || {} }]);
    }
  }

  async function updateCell(rowId: string, fieldId: string, value: unknown) {
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, data: { ...r.data, [fieldId]: value } } : r)));
    const res = await fetch(`/api/rows/${rowId}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ data: { [fieldId]: value } }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, data: updated.data || {} } : r)));
    }
  }

  async function addField(name: string, type: FieldType, options?: unknown) {
    if (!activeTableId) return;
    const res = await fetch(`/api/tables/${activeTableId}/fields`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(options === undefined ? { name, type } : { name, type, options }),
    });
    if (res.ok) {
      const f = await res.json();
      setTable((t0) => (t0 ? { ...t0, fields: [...t0.fields, f] } : t0));
    }
  }

  async function editField(fieldId: string, patch: { name: string; type: FieldType; options?: unknown }) {
    setTable((t0) =>
      t0 ? { ...t0, fields: t0.fields.map((f) => (f.id === fieldId ? { ...f, name: patch.name, type: patch.type } : f)) } : t0,
    );
    const res = await fetch(`/api/fields/${fieldId}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) });
    if (res.ok) {
      const f = await res.json();
      setTable((t0) => (t0 ? { ...t0, fields: t0.fields.map((x) => (x.id === fieldId ? f : x)) } : t0));
    }
  }

  async function deleteRow(rowId: string) {
    setRows((rs) => rs.filter((r) => r.id !== rowId));
    await fetch(`/api/rows/${rowId}`, { method: 'DELETE' });
  }

  async function deleteField(fieldId: string) {
    setTable((t0) => (t0 ? { ...t0, fields: t0.fields.filter((f) => f.id !== fieldId) } : t0));
    await fetch(`/api/fields/${fieldId}`, { method: 'DELETE' });
    reloadSchema();
  }

  async function setPrimary(fieldId: string) {
    if (!activeTableId) return;
    setTable((t0) => (t0 ? { ...t0, primaryFieldId: fieldId } : t0));
    await fetch(`/api/tables/${activeTableId}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ primaryFieldId: fieldId }),
    });
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={22} /></div>;
  }
  if (!base) {
    return (
      <div style={{ padding: 40 }}>
        <Link href="/database" className="btn btn-ghost"><ChevronLeft size={16} /> {t('title')}</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '18px clamp(12px, 3vw, 28px)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Link href="/database" className="btn btn-ghost btn-icon" style={{ width: 32, height: 32 }}>
          <ChevronLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{base.name}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto' }}>
        {base.tables.map((tab) => {
          const active = tab.id === activeTableId;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTableId(tab.id)}
              style={{
                border: 'none', background: 'transparent', padding: '8px 12px', cursor: 'pointer', fontSize: 13.5,
                fontWeight: active ? 700 : 500, color: active ? 'var(--text)' : 'var(--text-2)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, marginBottom: -1,
                whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Table2 size={14} /> {tab.name}
            </button>
          );
        })}
        <button onClick={() => setNewTableOpen(true)} className="btn btn-ghost btn-icon" title={t('newTable')} style={{ width: 28, height: 28, marginLeft: 4 }}>
          <Plus size={15} />
        </button>
      </div>

      {base.tables.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{t('noTables')}</div>
          <button className="btn btn-primary" onClick={() => setNewTableOpen(true)} style={{ marginTop: 14 }}>
            <Plus size={16} /> {t('newTable')}
          </button>
        </div>
      ) : !table ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={20} /></div>
      ) : (
        <GridView
          table={table}
          rows={rows}
          members={members}
          onCellChange={updateCell}
          onAddRow={addRow}
          onAddField={addField}
          onEditField={editField}
          onDeleteRow={deleteRow}
          onDeleteField={deleteField}
          onSetPrimary={setPrimary}
        />
      )}

      <Modal open={newTableOpen} onClose={() => setNewTableOpen(false)} title={t('newTable')} width={420}>
        <label className="field-label">{t('tableName')}</label>
        <input
          className="field"
          autoFocus
          value={newTableName}
          onChange={(e) => setNewTableName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createTable()}
          placeholder={t('tableNamePlaceholder')}
          style={{ width: '100%', marginBottom: 18 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setNewTableOpen(false)}>{tc('cancel')}</button>
          <button className="btn btn-primary" onClick={createTable} disabled={!newTableName.trim() || busy}>
            {busy ? <Spinner size={15} /> : t('createTable')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
