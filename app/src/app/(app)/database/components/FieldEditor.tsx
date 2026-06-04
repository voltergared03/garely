'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { CHOICE_COLORS, type FieldT, type FieldType, type SelectChoice } from '../lib/types';

const ALL_TYPES: FieldType[] = ['text', 'longText', 'number', 'currency', 'percent', 'rating', 'singleSelect', 'multiSelect', 'date', 'person', 'checkbox', 'url', 'email', 'phone'];

type Opts = { choices?: SelectChoice[]; precision?: number; includeTime?: boolean; multiple?: boolean; symbol?: string; max?: number };

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
      return { includeTime: prev.includeTime ?? false };
    case 'person':
      return { multiple: prev.multiple ?? false };
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

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setType(initial?.type ?? 'text');
      setOpts((initial?.options as Opts) ?? {});
    }
  }, [open, initial]);

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
    else if (type === 'date') draft.options = { includeTime: !!opts.includeTime };
    else if (type === 'person') draft.options = { multiple: !!opts.multiple };
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!opts.includeTime} onChange={(e) => setOpts((p) => ({ ...p, includeTime: e.target.checked }))} />
          {t('includeTime')}
        </label>
      )}

      {type === 'person' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!opts.multiple} onChange={(e) => setOpts((p) => ({ ...p, multiple: e.target.checked }))} />
          {t('multiplePeople')}
        </label>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
        <button className="btn btn-ghost" onClick={onClose}>{tc('cancel')}</button>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>{tc('save')}</button>
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
