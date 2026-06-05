'use client';

import { useTranslations } from 'next-intl';
import { Plus, MoreHorizontal, Pencil, Trash2, Table2, Layers, CalendarDays } from 'lucide-react';
import { PopMenu, MenuRow } from './Menu';
import type { ViewT } from '../lib/types';

const VIEW_ICON: Record<ViewT['type'], typeof Table2> = { grid: Table2, kanban: Layers, calendar: CalendarDays };

export function ViewTabs({ views, activeId, onSwitch, onAdd, onRename, onDelete }: {
  views: ViewT[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onAdd: (type: ViewT['type']) => void;
  onRename: (view: ViewT) => void;
  onDelete: (view: ViewT) => void;
}) {
  const t = useTranslations('database');
  const ordered = [...views].sort((a, b) => a.position - b.position);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
      {ordered.map((v) => {
        const active = v.id === activeId;
        const Icon = VIEW_ICON[v.type] ?? Table2;
        return (
          <div
            key={v.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 2, padding: '3px 4px 3px 10px', borderRadius: 9,
              background: active ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'transparent',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            <button
              onClick={() => onSwitch(v.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: active ? 'var(--text)' : 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 500, whiteSpace: 'nowrap' }}
            >
              <Icon size={14} /> {v.name}
            </button>
            {active && (
              <PopMenu trigger={<MoreHorizontal size={14} />} width={170} small label={t('menu')}>
                {(close) => (
                  <>
                    <MenuRow icon={<Pencil size={14} />} label={t('renameView')} onClick={() => { close(); onRename(v); }} />
                    <MenuRow icon={<Trash2 size={14} />} label={t('deleteView')} danger disabled={views.length <= 1} onClick={() => { if (views.length > 1) { close(); onDelete(v); } }} />
                  </>
                )}
              </PopMenu>
            )}
          </div>
        );
      })}
      <PopMenu trigger={<Plus size={15} />} width={184} align="left" label={t('newView')}>
        {(close) => (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', padding: '4px 10px 6px' }}>{t('newView')}</div>
            <MenuRow icon={<Table2 size={14} />} label={t('gridView')} onClick={() => { close(); onAdd('grid'); }} />
            <MenuRow icon={<Layers size={14} />} label={t('kanbanView')} onClick={() => { close(); onAdd('kanban'); }} />
            <MenuRow icon={<CalendarDays size={14} />} label={t('calendarView')} onClick={() => { close(); onAdd('calendar'); }} />
          </>
        )}
      </PopMenu>
    </div>
  );
}
