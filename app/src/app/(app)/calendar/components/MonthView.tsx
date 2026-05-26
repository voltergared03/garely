'use client';

import { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { fmtTime } from '@/lib/utils';
import type { Meeting, CalTask } from '../lib/types';
import { eventAccent, dateKey, isSameDay, tasksByDayMap, getMonthGrid } from '../lib/dates';
import { TaskChip } from './TaskChip';

/* ------------------------------------------------------------------ */
/*  MonthView                                                         */
/* ------------------------------------------------------------------ */

export function MonthView({
  year,
  month,
  meetings,
  tasks,
  today,
  onDayClick,
  onTaskClick,
}: {
  year: number;
  month: number;
  meetings: Meeting[];
  tasks: CalTask[];
  today: Date;
  onDayClick: (date: Date, dayMeetings: Meeting[], dayTasks: CalTask[]) => void;
  onTaskClick: (t: CalTask) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const days = useMemo(() => getMonthGrid(year, month), [year, month]);

  // Monday-first short weekday names (2024-01-01 is a Monday).
  const dowNames = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 1 + i))
      ),
    [locale],
  );

  const meetingsByDay = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    meetings.forEach((m) => {
      if (!m.scheduledAt) return;
      const d = new Date(m.scheduledAt);
      const key = dateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    return map;
  }, [meetings]);

  const tasksByDay = useMemo(() => tasksByDayMap(tasks), [tasks]);

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* DOW headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {dowNames.map((d) => (
          <div
            key={d}
            style={{
              padding: '10px 14px',
              fontSize: 11.5,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              borderLeft: '1px solid var(--border)',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridAutoRows: '1fr',
          flex: 1,
          minHeight: 0,
        }}
      >
        {days.map((d, i) => {
          const key = dateKey(d);
          const dayMeetings = (meetingsByDay[key] || []).sort((a, b) => {
            const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
            const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
            return ta - tb;
          });
          const dayTasks = tasksByDay[key] || [];
          // When the day has deadlines, leave room for them (2 meetings + 2
          // tasks); otherwise keep the original 3-meeting cap.
          const hasTasks = dayTasks.length > 0;
          const shownM = Math.min(hasTasks ? 2 : 3, dayMeetings.length);
          const shownT = hasTasks ? Math.min(2, dayTasks.length) : 0;
          const moreCount = dayMeetings.length - shownM + (dayTasks.length - shownT);
          const otherMonth = d.getMonth() !== month;
          const isToday = isSameDay(d, today);

          return (
            <button
              key={i}
              onClick={() => onDayClick(d, dayMeetings, dayTasks)}
              style={{
                borderLeft: '1px solid var(--border)',
                borderTop: '1px solid var(--border)',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                textAlign: 'left',
                background: isToday
                  ? 'color-mix(in oklab, var(--accent) 6%, transparent)'
                  : 'transparent',
                color: otherMonth ? 'var(--muted)' : 'var(--text)',
                cursor: 'pointer',
                minHeight: 90,
                minWidth: 0,
                overflow: 'hidden',
                border: 'none',
                borderLeftStyle: 'solid',
                borderLeftWidth: 1,
                borderLeftColor: 'var(--border)',
                borderTopStyle: 'solid',
                borderTopWidth: 1,
                borderTopColor: 'var(--border)',
              }}
              onMouseEnter={(e) => {
                if (!isToday) e.currentTarget.style.background = 'var(--surface)';
              }}
              onMouseLeave={(e) => {
                if (!isToday) e.currentTarget.style.background = 'transparent';
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? 'var(--accent)' : 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{d.getDate()}</span>
                {dayMeetings.length > 0 && (
                  <span
                    className="mono"
                    style={{ fontSize: 10, color: 'var(--muted)' }}
                  >
                    {dayMeetings.length}
                  </span>
                )}
              </div>

              {/* Event chips */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  flex: 1,
                  overflow: 'hidden',
                }}
              >
                {dayMeetings.slice(0, shownM).map((m) => {
                  const accent = eventAccent(m);
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: `color-mix(in oklab, ${accent} 14%, transparent)`,
                        borderLeft: `2px solid ${accent}`,
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}
                      title={m.title}
                    >
                      <span
                        className="mono"
                        style={{ fontSize: 9.5, opacity: 0.7 }}
                      >
                        {m.scheduledAt ? fmtTime(new Date(m.scheduledAt)) : ''}
                      </span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {m.title}
                      </span>
                    </div>
                  );
                })}
                {dayTasks.slice(0, shownT).map((tk) => (
                  <TaskChip key={tk.id} task={tk} onClick={onTaskClick} />
                ))}
                {moreCount > 0 && (
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                    {t('calendar.moreCount', { count: moreCount })}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
