'use client';

import { ListChecks } from 'lucide-react';
import type { CalTask } from '../lib/types';
import { taskAccent } from '../lib/dates';

/* ------------------------------------------------------------------ */
/*  TaskChip — a deadline pill shown in week/month cells              */
/* ------------------------------------------------------------------ */
export function TaskChip({ task, onClick }: { task: CalTask; onClick: (t: CalTask) => void }) {
  const accent = taskAccent(task.priority);
  const done = task.status === 'done';
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(task);
      }}
      title={task.title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        width: '100%',
        background: `color-mix(in oklab, ${accent} 13%, transparent)`,
        border: `1px solid color-mix(in oklab, ${accent} 30%, transparent)`,
        borderRadius: 5,
        padding: '2px 6px',
        fontSize: 11,
        lineHeight: 1.2,
        color: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        opacity: done ? 0.55 : 1,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.filter = 'none')}
    >
      <ListChecks size={10} style={{ color: accent, flexShrink: 0 }} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {task.title}
      </span>
    </button>
  );
}
