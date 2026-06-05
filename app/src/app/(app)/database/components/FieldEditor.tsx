'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { CHOICE_COLORS, type FieldT, type FieldType, type SelectChoice, type OrgTable } from '../lib/types';

const ALL_TYPES: FieldType[] = ['text', 'longText', 'number', 'currency', 'percent', 'rating', 'singleSelect', 'multiSelect', 'date', 'person', 'checkbox', 'url', 'email', 'phone', 'file', 'totp', 'password', 'link'];

type Opts = { choices?: SelectChoice[]; precision?: number; includeTime?: boolean; multiple?: boolean; symbol?: string; max?: number; targetTableId?: string; displayFieldId?: string; reminderDays?: number };

function defaultsFor(type: FieldType, prev: Opts): Opts {
  switch (type) {
    case 'singleSelect':
    case 'multiSelect':
      return { choices: prev.choices ?? [] };
    case 'number':
      return { precision: prev.precision ?? 0 };
    case 'currency':
      return { symbol: prev.symbol ?? '₴', precision: prev.precision ?? 2 };
    case 'percent':
      return { precision: prev.precision ?? 0 };
    case 'rating':
      return { max: prev.max ?? 5 };
    case 'date':
      return { includeTime: prev.includeTime ?? false, reminderDays: prev.reminderDays };
    case 'person':
      return { multiple: prev.multiple ?? false };
    case 'link':
      return { targetTableId: prev.targetTableId ?? '', displayFieldId: prev.displayFieldId, multiple: prev.multiple ?? true };
    default:
      return {};
  }
}

export interface FieldDraft {
  name: string;
  type: FieldType;
  options?: Opts;
}

export function FieldEditor({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: FieldT | null;
  onClose: () => void;
  onSave: (draft: FieldDraft) => void;
}) {
  const t = useTranslations('database');
  const tc = useTranslations('common');
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [opts, setOpts] = useState<Opts>({});
  const [tables, setTables] = useState<OrgTable[]>([]);
  const [targetFields, setTargetFields] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setType(initial?.type ?? 'text');
      setOpts((initial?.options as Opts) ?? {});
    }
  }, [open, initial]);

  // Link field: load the org's tables (for the target picker) + the chosen target's fields.
  useEffect(() => {
    if (open && type === 'link' && tables.length === 0) {
      fetch('/api/tables').then((r) => (r.ok ? r.json() : [])).then(setTables).catch(() => {});
    }
  }, [open, type, tables.length]);

  useEffect(() => {
    const tid = opts.targetTableId;
    if (type !== 'link' || !tid) { setTargetFields([]); return; }
    fetch(`/api/tables/${tid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTargetFields(Array.isArray(d?.fields) ? d.fields.map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })) : []))
      .catch(() => setTargetFields([]));
  }, [type, opts.targetTableId]);

  const changeType = (ty: FieldType) => {
    setType(ty);
    setOpts((p) => defaultsFor(ty, p));
  };

  const choices = opts.choices ?? [];
  const setChoices = (c: SelectChoice[]) => setOpts((p) => ({ ...p, choices: c }));
  const addChoice = () =>
    setChoices([...choices, { id: crypto.randomUUID(), name: '', color: CHOICE_COLORS[choices.length % CHOICE_COLORS.length] }]);

  const save = () => {
    const draft: FieldDraft = { name: name.trim() || t('fieldName'), type };
    if (type === 'singleSelect' || type === 'multiSelect') draft.options = { choices: choices.filter((c) => c.name.trim()) };
    else if (type === 'number') draft.options = { precision: opts.precision ?? 0 };
    else if (type === 'currency') draft.options = { symbol: (opts.symbol || '₴').slice(0, 4), precision: opts.precision ?? 2 };
    else if (type === 'percent') draft.options = { precision: opts.precision ?? 0 };
    else if (type === 'rating') draft.options = { max: opts.max ?? 5 };
    else if (type === 'date') draft.options = { includeTime: !!opts.includeTime, ...(opts.reminderDays && opts.reminderDays > 0 ? { reminderDays: opts.reminderDays } : {}) };
    else if (type === 'person') draft.options = { multiple: !!opts.multiple };
    else if (type === 'link') draft.options = { targetTableId: opts.targetTableId || '', displayFieldId: opts.displayFieldId, multiple: !!opts.multiple };
    onSave(draft);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? t('editField') : t('addField')} width={460}>
      <label className="field-label">{t('fieldName')}</label>
      <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />

      <label className="field-label">{t('fieldType')}</label>
      <Select
        value={type}
        onChange={(v) => changeType(v as FieldType)}
        options={ALL_TYPES.map((ty) => ({ value: ty, label: t(`fieldTypes.${ty}`) }))}
        style={{ width: '100%', marginBottom: 14 }}
      />

      {(type === 'singleSelect' || type === 'multiSelect') && (
        <div style={{ marginBottom: 14 }}>
          <label className="field-label">{t('options')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {choices.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ColorSwatch color={c.color} onChange={(col) => setChoices(choices.map((x, j) => (j === i ? { ...x, color: col } : x)))} />
                <input
                  className="field"
                  value={c.name}
                  placeholder={t('choiceName')}
                  onChange={(e) => setChoices(choices.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-ghost btn-icon" onClick={() => setChoices(choices.filter((_, j) => j !== i))} style={{ width: 30, height: 30 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button className="btn btn-ghost" onClick={addChoice} style={{ justifyContent: 'center' }}>
              <Plus size={14} /> {t('addChoice')}
            </button>
          </div>
        </div>
      )}

      {type === 'number' && (
        <div style={{ marginBottom: 14 }}>
          <label className="field-label">{t('precision')}</label>
          <input
            type="number"
            min={0}
            max={8}
            className="field"
            value={opts.precision ?? 0}
            onChange={(e) => setOpts((p) => ({ ...p, precision: Math.max(0, Math.min(8, Number(e.target.value) || 0)) }))}
            style={{ width: 120 }}
          />
        </div>
      )}

      {type === 'currency' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div>
            <label className="field-label">{t('currencySymbol')}</label>
            <input
              className="field"
              value={opts.symbol ?? '₴'}
              maxLength={4}
              onChange={(e) => setOpts((p) => ({ ...p, symbol: e.target.value }))}
              style={{ width: 90 }}
            />
          </div>
          <div>
            <label className="field-label">{t('precision')}</label>
            <input
              type="number"
              min={0}
              max={8}
              className="field"
              value={opts.precision ?? 2}
              onChange={(e) => setOpts((p) => ({ ...p, precision: Math.max(0, Math.min(8, Number(e.target.value) || 0)) }))}
              style={{ width: 90 }}
            />
          </div>
        </div>
      )}

      {type === 'link' && (
        <div style={{ marginBottom: 14 }}>
          <label className="field-label">{t('linkTable')}</label>
          <Select
            value={opts.targetTableId ?? ''}
            onChange={(v) => setOpts((p) => ({ ...p, targetTableId: v, displayFieldId: undefined }))}
            options={tables.map((tb) => ({ value: tb.id, label: `${tb.baseName} · ${tb.name}` }))}
            placeholder={t('linkPickTable')}
            style={{ width: '100%', marginBottom: 10 }}
          />
          {opts.targetTableId && (
            <>
              <label className="field-label">{t('linkDisplayField')}</label>
              <Select
                value={opts.displayFieldId ?? ''}
                onChange={(v) => setOpts((p) => ({ ...p, displayFieldId: v || undefined }))}
                options={targetFields.map((f) => ({ value: f.id, label: f.name }))}
                placeholder={t('linkDisplayDefault')}
                style={{ width: '100%', marginBottom: 10 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!opts.multiple} onChange={(e) => setOpts((p) => ({ ...p, multiple: e.target.checked }))} />
                {t('multipleRecords')}
              </label>
            </>
          )}
        </div>
      )}

      {type === 'percent' && (
        <div style={{ marginBottom: 14 }}>
          <label className="field-label">{t('precision')}</label>
          <input
            type="number"
            min={0}
            max={8}
            className="field"
            value={opts.precision ?? 0}
            onChange={(e) => setOpts((p) => ({ ...p, precision: Math.max(0, Math.min(8, Number(e.target.value) || 0)) }))}
            style={{ width: 120 }}
          />
        </div>
      )}

      {type === 'rating' && (
        <div style={{ marginBottom: 14 }}>
          <label className="field-label">{t('ratingMax')}</label>
          <input
            type="number"
            min={1}
            max={10}
            className="field"
            value={opts.max ?? 5}
            onChange={(e) => setOpts((p) => ({ ...p, max: Math.max(1, Math.min(10, Number(e.target.value) || 5)) }))}
            style={{ width: 120 }}
          />
        </div>
      )}

      {type === 'date' && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!opts.includeTime} onChange={(e) => setOpts((p) => ({ ...p, includeTime: e.target.checked }))} />
            {t('includeTime')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: opts.reminderDays ? 8 : 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!opts.reminderDays}
              onChange={(e) => setOpts((p) => ({ ...p, reminderDays: e.target.checked ? (p.reminderDays && p.reminderDays > 0 ? p.reminderDays : 3) : undefined }))}
            />
            {t('reminderToggle')}
          </label>
          {!!opts.reminderDays && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingLeft: 24 }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('reminderDaysLabel')}</span>
              <input
                type="number"
                min={1}
                max={365}
                value={opts.reminderDays ?? 3}
                onChange={(e) => setOpts((p) => ({ ...p, reminderDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) }))}
                className="field"
                style={{ width: 84, padding: '6px 8px' }}
              />
            </div>
          )}
        </>
      )}

      {type === 'person' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!opts.multiple} onChange={(e) => setOpts((p) => ({ ...p, multiple: e.target.checked }))} />
          {t('multiplePeople')}
        </label>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
        <button className="btn btn-ghost" onClick={onClose}>{tc('cancel')}</button>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim() || (type === 'link' && !opts.targetTableId)}>{tc('save')}</button>
      </div>
    </Modal>
  );
}

function ColorSwatch({ color, onChange }: { color?: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: color || 'var(--surface-3)', cursor: 'pointer', flexShrink: 0 }}
      />
      {open && (
        <div
          style={{
            position: 'absolute', top: 30, left: 0, zIndex: 10, display: 'flex', gap: 5, flexWrap: 'wrap', width: 150, padding: 7,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,.45)',
          }}
        >
          {CHOICE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              style={{ width: 22, height: 22, borderRadius: 5, background: c, border: color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,.15)', cursor: 'pointer' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
