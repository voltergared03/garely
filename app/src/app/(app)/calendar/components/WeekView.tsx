'use client';

import { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AvatarStack } from '@/components/ui/avatar';
import { fmtTime, pad } from '@/lib/utils';
import type { Meeting, CalTask } from '../lib/types';
import {
  eventAccent,
  dateKey,
  isSameDay,
  tasksByDayMap,
  getParticipantNames,
} from '../lib/dates';
import { TaskChip } from './TaskChip';

const ROW_H = 56;
const START_HOUR = 8;
const END_HOUR = 20;
const TOTAL_HOURS = END_HOUR - START_HOUR;

/* ------------------------------------------------------------------ */
/*  WeekView                                                          */
/* ------------------------------------------------------------------ */

export function WeekView({
  weekStart,
  meetings,
  tasks,
  today,
  onMeetingClick,
  onTaskClick,
}: {
  weekStart: Date;
  meetings: Meeting[];
  tasks: CalTask[];
  today: Date;
  onMeetingClick: (m: Meeting) => void;
  onTaskClick: (t: CalTask) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [weekStart]);

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
  const weekHasTasks = useMemo(
    () => days.some((d) => (tasksByDay[dateKey(d)] || []).length > 0),
    [days, tasksByDay],
  );

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  const nowLineTop = useMemo(() => {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const startMins = START_HOUR * 60;
    const endMins = END_HOUR * 60;
    if (mins < startMins || mins > endMins) return null;
    return ((mins - startMins) / (endMins - startMins)) * (TOTAL_HOURS * ROW_H);
  }, []);

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Day headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '64px repeat(7, 1fr)',
          minWidth: 560,
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          background: 'var(--bg)',
          zIndex: 2,
        }}
      >
        <div />
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={i}
              style={{
                padding: '12px 14px',
                borderLeft: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: isToday ? 'var(--accent)' : 'var(--text)',
                  marginTop: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {d.getDate()}
                {isToday && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day deadlines row */}
      {weekHasTasks && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '64px repeat(7, 1fr)',
            minWidth: 560,
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: 'var(--muted)',
              textAlign: 'right',
              padding: '8px 8px 0',
              fontFamily: 'var(--mono)',
              textTransform: 'uppercase',
              letterSpacing: '.04em',
            }}
          >
            {t('calendar.due')}
          </div>
          {days.map((d, i) => {
            const dayTasks = tasksByDay[dateKey(d)] || [];
            return (
              <div
                key={i}
                style={{
                  borderLeft: '1px solid var(--border)',
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  minHeight: 10,
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                {dayTasks.map((tk) => (
                  <TaskChip key={tk.id} task={tk} onClick={onTaskClick} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Time grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '64px repeat(7, 1fr)',
          minWidth: 560,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Time gutter */}
        <div>
          {hours.map((h) => (
            <div
              key={h}
              style={{
                height: ROW_H,
                padding: '4px 8px 0',
                fontSize: 10.5,
                color: 'var(--muted)',
                textAlign: 'right',
                borderTop: '1px solid var(--border)',
                fontFamily: 'var(--mono)',
              }}
            >
              {pad(h)}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d, colIdx) => {
          const key = dateKey(d);
          const dayMeetings = (meetingsByDay[key] || []).filter(
            (m) => {
              const s = new Date(m.scheduledAt!);
              return s.getHours() >= START_HOUR && s.getHours() <= END_HOUR;
            }
          );
          const isToday = isSameDay(d, today);

          return (
            <div
              key={colIdx}
              style={{
                borderLeft: '1px solid var(--border)',
                position: 'relative',
                background: isToday
                  ? 'color-mix(in oklab, var(--accent) 3%, transparent)'
                  : 'transparent',
              }}
            >
              {/* Hour lines */}
              {hours.map((h) => (
                <div
                  key={h}
                  style={{
                    height: ROW_H,
                    borderTop: '1px solid var(--border)',
                  }}
                />
              ))}

              {/* Event blocks */}
              {dayMeetings.map((m) => {
                const start = new Date(m.scheduledAt!);
                const startH = start.getHours() + start.getMinutes() / 60;
                const topPx = (startH - START_HOUR) * ROW_H;
                const heightPx = Math.max((m.durationMin / 60) * ROW_H - 4, 24);
                const accent = eventAccent(m);
                const users = getParticipantNames(m);

                return (
                  <button
                    key={m.id}
                    onClick={() => onMeetingClick(m)}
                    style={{
                      position: 'absolute',
                      left: 4,
                      right: 4,
                      top: topPx,
                      height: heightPx,
                      background: `color-mix(in oklab, ${accent} 22%, var(--surface))`,
                      borderLeft: `3px solid ${accent}`,
                      border: `1px solid color-mix(in oklab, ${accent} 35%, var(--border))`,
                      borderLeftWidth: 3,
                      borderLeftColor: accent,
                      borderRadius: 8,
                      padding: '6px 8px',
                      textAlign: 'left',
                      color: 'inherit',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      zIndex: 2,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.filter = 'none';
                    }}
                  >
                    <div
                      className="mono"
                      style={{ fontSize: 10.5, color: 'var(--muted)' }}
                    >
                      {fmtTime(start)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        lineHeight: 1.25,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {m.title}
                    </div>
                    {heightPx > 60 && (
                      <div style={{ marginTop: 'auto' }}>
                        <AvatarStack users={users} max={3} size="sm" />
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Now line */}
              {isToday && nowLineTop !== null && (
                <div
                  style={{
                    position: 'absolute',
                    top: nowLineTop,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: 'var(--accent)',
                    zIndex: 5,
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: -4,
                      top: -3,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
