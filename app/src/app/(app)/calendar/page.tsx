'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  X,
  Video,
  RefreshCw,
  Clock,
  Users as UsersIcon,
  FileText,
  ListChecks,
  Check,
  ExternalLink,
  Trash2,
  Edit3,
  Loader2,
  Pencil,
  Save,
  Search,
  Wand2,
  ListChecks as ListChecksIcon,
} from 'lucide-react';
import { AvatarStack, Avatar } from '@/components/ui/avatar';
import {
  fmtTime,
  fmtDateLong,
  pad,
} from '@/lib/utils';
import { useIsMobile } from '@/lib/use-is-mobile';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Participant {
  user: { id: string; name: string | null; image: string | null } | null;
  guestName: string | null;
}

interface Meeting {
  id: string;
  title: string;
  scheduledAt: string | null;
  durationMin: number;
  status: string;
  description?: string | null;
  recurrence?: any;
  createdBy: { id: string; name: string | null; image: string | null };
  participants: Participant[];
  reports?: { id: string }[];
  agenda?: string[] | null;
  joinToken?: string | null;
  _count?: { transcripts: number; tasks: number };
}

// A task with a deadline, shown on the calendar on its due date.
interface CalTask {
  id: string;
  title: string;
  dueDate: string;
  status: string; // open | in_progress | done
  priority: string; // high | medium | low
  meetingId: string | null;
  meeting?: { id: string; title: string } | null;
  assignee?: { id: string; name: string | null; image: string | null } | null;
}

interface WsUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const ROW_H = 56;
const START_HOUR = 8;
const END_HOUR = 20;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function eventAccent(m: Meeting): string {
  if (m.recurrence) return 'var(--accent)';
  if (m.status === 'completed') return 'var(--muted)';
  return 'var(--green)';
}

// Task deadlines are coloured by priority so urgency reads at a glance.
function taskAccent(priority: string): string {
  if (priority === 'high') return 'var(--red)';
  if (priority === 'low') return 'var(--muted)';
  return 'var(--amber)';
}

/** Group task deadlines by day (YYYY-MM-DD) for calendar placement. */
function tasksByDayMap(tasks: CalTask[]): Record<string, CalTask[]> {
  const map: Record<string, CalTask[]> = {};
  for (const tk of tasks) {
    if (!tk.dueDate) continue;
    const key = dateKey(new Date(tk.dueDate));
    (map[key] ||= []).push(tk);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getParticipantNames(m: Meeting) {
  return m.participants.map((p) => ({
    name: p.user?.name || p.guestName || 'Guest',
    image: p.user?.image || null,
  }));
}

function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const dayOfWeek = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(start.getDate() - dayOfWeek);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

/* ------------------------------------------------------------------ */
/*  TaskChip — a deadline pill shown in week/month cells              */
/* ------------------------------------------------------------------ */
function TaskChip({ task, onClick }: { task: CalTask; onClick: (t: CalTask) => void }) {
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

/* ------------------------------------------------------------------ */
/*  WeekView                                                          */
/* ------------------------------------------------------------------ */

function WeekView({
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

/* ------------------------------------------------------------------ */
/*  MonthView                                                         */
/* ------------------------------------------------------------------ */

function MonthView({
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

/* ------------------------------------------------------------------ */
/*  DayModal                                                          */
/* ------------------------------------------------------------------ */

function DayModal({
  date,
  meetings,
  tasks,
  onClose,
  onMeetingClick,
  onTaskClick,
}: {
  date: Date;
  meetings: Meeting[];
  tasks: CalTask[];
  onClose: () => void;
  onMeetingClick: (m: Meeting) => void;
  onTaskClick: (t: CalTask) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.55)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: 520,
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: 0,
          animation: 'fadeIn .15s',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '22px 24px 24px' }}>
          {/* Modal header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                {new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                }}
              >
                {fmtDateLong(date, locale)}
              </div>
            </div>
            <button
              className="btn btn-ghost btn-icon"
              onClick={onClose}
              style={{ flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Meetings + deadlines */}
          {meetings.length === 0 && tasks.length === 0 ? (
            <div
              style={{
                padding: '32px 0',
                textAlign: 'center',
                color: 'var(--muted)',
              }}
            >
              <Calendar
                size={28}
                style={{ opacity: 0.5, marginBottom: 10 }}
              />
              <div style={{ marginBottom: 12 }}>{t('calendar.noMeetings')}</div>
              <Link
                href="/schedule"
                className="btn btn-primary btn-sm"
                style={{ textDecoration: 'none', gap: 5 }}
                onClick={onClose}
              >
                <Plus size={13} /> {t('nav.newMeeting')}
              </Link>
            </div>
          ) : (
            <>
            {meetings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {meetings
                .sort((a, b) => {
                  const ta = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
                  const tb = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
                  return ta - tb;
                })
                .map((m) => {
                  const start = m.scheduledAt ? new Date(m.scheduledAt) : null;
                  const end =
                    start ? new Date(start.getTime() + m.durationMin * 60000) : null;
                  const accent = eventAccent(m);
                  const users = getParticipantNames(m);

                  return (
                    <div
                      key={m.id}
                      onClick={() => onMeetingClick(m)}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        borderLeft: `3px solid ${accent}`,
                        background: `color-mix(in oklab, ${accent} 5%, var(--surface))`,
                        cursor: 'pointer',
                        transition: 'filter .15s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.filter = 'brightness(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.filter = 'none';
                      }}
                    >
                      <div style={{ width: 50, flexShrink: 0, textAlign: 'center' }}>
                        <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                          {start ? fmtTime(start) : '--:--'}
                        </div>
                        <div className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {end ? fmtTime(end) : ''}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13.5,
                            marginBottom: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.title}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <AvatarStack users={users} max={4} size="sm" />
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {t('calendar.participantsShort', { count: users.length })}
                          </span>
                          {m.recurrence && (
                            <span className="chip" style={{ fontSize: 10 }}>
                              <RefreshCw size={9} /> {t('calendar.weekly')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Video size={14} style={{ color: 'var(--muted)' }} />
                      </div>
                    </div>
                  );
                })}
            </div>
            )}
            {tasks.length > 0 && (
              <div style={{ marginTop: meetings.length > 0 ? 18 : 0 }}>
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <ListChecks size={12} /> {t('calendar.deadlines')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tasks.map((tk) => {
                    const accent = taskAccent(tk.priority);
                    return (
                      <div
                        key={tk.id}
                        onClick={() => onTaskClick(tk)}
                        style={{
                          display: 'flex',
                          gap: 12,
                          alignItems: 'center',
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                          borderLeft: `3px solid ${accent}`,
                          background: `color-mix(in oklab, ${accent} 5%, var(--surface))`,
                          cursor: 'pointer',
                          transition: 'filter .15s',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.1)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = 'none'; }}
                      >
                        <ListChecks size={16} style={{ color: accent, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tk.title}
                          </div>
                          {tk.meeting?.title && (
                            <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                              {tk.meeting.title}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}



/* ------------------------------------------------------------------ */
/*  MeetingDetailModal                                                */
/* ------------------------------------------------------------------ */

function MeetingDetailModal({
  meeting: m,
  onClose,
  onJoin,
  onEdit,
  onDelete,
  deleting,
}: {
  meeting: Meeting;
  onClose: () => void;
  onJoin: (m: Meeting) => void;
  onEdit: (m: Meeting) => void;
  onDelete: (m: Meeting) => void;
  deleting: boolean;
}) {
  const start = m.scheduledAt ? new Date(m.scheduledAt) : null;
  const end = start ? new Date(start.getTime() + m.durationMin * 60000) : null;
  const accent = eventAccent(m);
  const users = getParticipantNames(m);
  const hasReport = m.reports && m.reports.length > 0;
  const isCompleted = m.status === 'completed' || m.status === 'ended';
  const agenda = Array.isArray(m.agenda) ? m.agenda : [];
  const isMobile = useIsMobile();
  const t = useTranslations();
  const locale = useLocale();

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: 540, maxWidth: 'calc(100vw - 24px)', maxHeight: '85vh', overflow: 'auto',
          padding: 0, animation: 'fadeIn .15s',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header with accent bar */}
        <div style={{
          height: 4, background: accent, borderRadius: '12px 12px 0 0',
        }} />

        <div style={{ padding: '20px 24px 24px' }}>
          {/* Status + time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {start && (
              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                {fmtTime(start)}{end ? ' — ' + fmtTime(end) : ''}
              </span>
            )}
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
              background: isCompleted
                ? 'color-mix(in oklab, var(--muted) 20%, transparent)'
                : 'color-mix(in oklab, var(--green) 18%, transparent)',
              color: isCompleted ? 'var(--muted)' : 'var(--green)',
            }}>
              {m.status === 'scheduled' ? t('calendar.status.scheduled') : m.status === 'live' ? t('calendar.status.live') : m.status === 'ended' ? t('calendar.status.ended') : m.status}
            </span>
            {m.recurrence && (
              <span className="chip" style={{ fontSize: 10 }}>
                <RefreshCw size={9} /> {t('calendar.recurring')}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
            {m.title}
          </h2>

          {/* Description */}
          {m.description && (
            <p style={{ color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.55, margin: '0 0 14px' }}>
              {m.description}
            </p>
          )}

          {/* Info row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 16, fontSize: 12.5, color: 'var(--muted)' }}>
            {start && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Calendar size={13} /> {fmtDateLong(start, locale)}
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={13} /> {t('common.minutes', { count: m.durationMin })}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <UsersIcon size={13} /> {t('common.participants', { count: m.participants?.length || 0 })}
            </span>
          </div>

          {/* Agenda */}
          {agenda.length > 0 && (
            <div style={{
              padding: '14px 16px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 10, marginBottom: 14,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
                textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
              }}>
                <ListChecks size={13} /> {t('meetingForm.agenda')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {agenda.map((item: string, idx: number) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, lineHeight: 1.45,
                  }}>
                    <span style={{ color: 'var(--muted)', fontWeight: 600, minWidth: 16, textAlign: 'right', flexShrink: 0 }}>
                      {idx + 1}.
                    </span>
                    <span style={{ color: 'var(--text-2)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Participants */}
          {users.length > 0 && (
            <div style={{
              padding: '12px 14px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 10, marginBottom: 14,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
                textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
              }}>
                <UsersIcon size={13} /> {t('meetingForm.participants')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AvatarStack users={users} size="md" max={6} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {users.map(u => u.name).join(', ')}
                </span>
              </div>
            </div>
          )}

          {/* Organizer */}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>
            {t('calendar.organizer')}: <strong style={{ color: 'var(--text-2)' }}>{m.createdBy?.name || t('calendar.unknown')}</strong>
          </div>

          {/* Action buttons — wrap on mobile so nothing overflows */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isCompleted && hasReport ? (
              <Link
                href={'/meetings/' + m.id + '/report'}
                className="btn btn-primary"
                style={{ textDecoration: 'none', flex: isMobile ? '1 1 100%' : 1, justifyContent: 'center', fontWeight: 600 }}
                onClick={onClose}
              >
                <FileText size={15} /> {t('calendar.viewReport')}
              </Link>
            ) : (
              <Link
                href={'/lobby/' + m.id}
                className="btn btn-primary"
                style={{ textDecoration: 'none', flex: isMobile ? '1 1 100%' : 1, justifyContent: 'center', fontWeight: 600 }}
                onClick={onClose}
              >
                <Video size={15} /> {m.status === 'live' ? t('common.join') : t('calendar.enterMeeting')}
              </Link>
            )}
            {!isCompleted && (
              <button
                className="btn"
                onClick={() => onEdit(m)}
                style={isMobile ? { flex: 1, justifyContent: 'center' } : { flexShrink: 0 }}
              >
                <Pencil size={14} /> {t('common.edit')}
              </button>
            )}
            {!isCompleted && (
              <button
                className="btn"
                onClick={() => onDelete(m)}
                disabled={deleting}
                style={{ color: '#fca5a5', flexShrink: 0 }}
              >
                {deleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
              </button>
            )}
            <button className="btn" onClick={onClose} style={isMobile ? { flex: 1, justifyContent: 'center' } : { flexShrink: 0 }}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



/* ------------------------------------------------------------------ */
/*  CalendarEditModal                                                 */
/* ------------------------------------------------------------------ */

function CalendarEditModal({ meeting, onClose, onSave }: {
  meeting: Meeting;
  onClose: () => void;
  onSave: (m: Meeting) => void;
}) {
  const t = useTranslations();
  const schedAt = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const [title, setTitle] = useState(meeting.title);
  const [description, setDescription] = useState(meeting.description || '');
  const [date, setDate] = useState(schedAt ? schedAt.toISOString().slice(0, 10) : '');
  const [time, setTime] = useState(schedAt ? schedAt.toTimeString().slice(0, 5) : '14:00');
  const [duration, setDuration] = useState(meeting.durationMin);
  const [saving, setSaving] = useState(false);
  const [agenda, setAgenda] = useState<string[]>(Array.isArray(meeting.agenda) ? meeting.agenda : []);
  const [newAgendaItem, setNewAgendaItem] = useState('');
  const [aiAgendaLoading, setAiAgendaLoading] = useState(false);

  // Participants
  const [allUsers, setAllUsers] = useState<WsUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<WsUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setAllUsers(data);
        const participantUserIds = meeting.participants
          .filter((p: any) => p.role !== 'host' && p.user)
          .map((p: any) => p.user!.id);
        const selected = data.filter((u: WsUser) => participantUserIds.includes(u.id));
        setSelectedUsers(selected);
      })
      .catch(console.error);
  }, [meeting.participants]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hostId = meeting.createdBy?.id;
  const filteredUsers = allUsers.filter(u => {
    if (u.id === hostId) return false;
    if (selectedUsers.some(s => s.id === u.id)) return false;
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  });

  const generateAgenda = async () => {
    if (aiAgendaLoading || title.trim().length < 3) return;
    setAiAgendaLoading(true);
    try {
      const res = await fetch('/api/meetings/ai-agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          currentAgenda: agenda.length > 0 ? agenda : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agenda && data.agenda.length > 0) setAgenda(data.agenda);
      }
    } catch (e) { console.error('AI agenda failed:', e); }
    finally { setAiAgendaLoading(false); }
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const scheduledAt = date && time ? new Date(`${date}T${time}:00`).toISOString() : null;
      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          scheduledAt,
          durationMin: duration,
          agenda: agenda.length > 0 ? agenda : null,
          participants: selectedUsers.map(u => ({ userId: u.id })),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onSave(updated);
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 110,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      overflowY: 'auto',
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 560, width: '100%', padding: '24px 22px', maxHeight: '90vh', overflowY: 'auto', animation: 'fadeIn .15s' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{t('calendar.editMeeting')}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">{t('meetingForm.title')}</label>
            <input className="field" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="field-label">{t('meetingForm.description')}</label>
            <textarea className="field" rows={2} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('meetingForm.descriptionPlaceholder')} style={{ resize: 'none' }} />
          </div>

          {/* Agenda */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="field-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <ListChecksIcon size={11} /> {t('calendar.agendaCount', { count: agenda.length })}
              </label>
              <button type="button" onClick={generateAgenda}
                disabled={aiAgendaLoading || title.trim().length < 3}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                  borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                  background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
                  color: title.trim().length < 3 ? 'var(--muted)' : 'var(--accent)',
                  cursor: aiAgendaLoading || title.trim().length < 3 ? 'not-allowed' : 'pointer',
                  opacity: title.trim().length < 3 ? 0.5 : 1,
                }}>
                {aiAgendaLoading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Wand2 size={11} />}
                AI
              </button>
            </div>
            {agenda.map((item, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                padding: '5px 8px', background: 'var(--surface)', borderRadius: 6,
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, minWidth: 14, textAlign: 'center' }}>{idx + 1}</span>
                <input value={item} onChange={e => setAgenda(prev => prev.map((x, i) => i === idx ? e.target.value : x))}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12.5, color: 'var(--text)', padding: 0 }} />
                <button type="button" onClick={() => setAgenda(prev => prev.filter((_, i) => i !== idx))}
                  style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent',
                    color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <X size={10} />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input className="field" placeholder={t('meetingForm.addAgendaItem')} value={newAgendaItem}
                onChange={e => setNewAgendaItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newAgendaItem.trim()) { setAgenda(p => [...p, newAgendaItem.trim()]); setNewAgendaItem(''); } } }}
                style={{ flex: 1, fontSize: 12, padding: '6px 10px' }} />
              <button type="button" className="btn btn-sm" onClick={() => { if (newAgendaItem.trim()) { setAgenda(p => [...p, newAgendaItem.trim()]); setNewAgendaItem(''); } }}
                disabled={!newAgendaItem.trim()} style={{ flexShrink: 0 }}>
                <Plus size={12} />
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <label className="field-label"><Calendar size={11} /> {t('meetingForm.date')}</label>
              <input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ minWidth: 0 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="field-label">{t('meetingForm.time')}</label>
              <input className="field" type="time" value={time} onChange={e => setTime(e.target.value)} style={{ minWidth: 0 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="field-label">{t('meetingForm.duration')}</label>
              <Select value={String(duration)} onChange={(v) => setDuration(parseInt(v))} style={{ minWidth: 0 }}
                options={[15, 30, 45, 60, 90, 120].map(d => ({ value: String(d), label: t('common.minutes', { count: d }) }))} />
            </div>
          </div>

          {/* Participants */}
          <div>
            <label className="field-label"><UsersIcon size={11} /> {t('calendar.participantsCount', { count: selectedUsers.length + 1 })}</label>
            {meeting.createdBy && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                background: 'var(--surface)', borderRadius: 8, marginBottom: 6, marginTop: 6,
              }}>
                <Avatar name={meeting.createdBy.name || 'U'} image={meeting.createdBy.image} size="sm" />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{meeting.createdBy.name}</div>
                <span className="chip" style={{ fontSize: 10 }}>{t('calendar.organizer')}</span>
              </div>
            )}

            {selectedUsers.map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                background: 'var(--surface)', borderRadius: 8, marginBottom: 4,
              }}>
                <Avatar name={u.name || 'U'} image={u.image} size="sm" />
                <div style={{ flex: 1, fontSize: 13 }}>{u.name}</div>
                <button className="btn btn-ghost btn-icon" style={{ width: 24, height: 24 }}
                  onClick={() => setSelectedUsers(p => p.filter(x => x.id !== u.id))}>
                  <X size={11} />
                </button>
              </div>
            ))}

            <div ref={searchRef} style={{ position: 'relative', marginTop: 6 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input className="field" placeholder={t('meetingForm.addParticipant')}
                  value={userSearch} onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  style={{ paddingLeft: 30, fontSize: 13 }} />
              </div>
              {showDropdown && filteredUsers.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 10, maxHeight: 180, overflowY: 'auto', zIndex: 60,
                  boxShadow: '0 8px 24px rgba(0,0,0,.3)',
                }}>
                  {filteredUsers.slice(0, 6).map(u => (
                    <button key={u.id} onClick={() => { setSelectedUsers(p => [...p, u]); setUserSearch(''); setShowDropdown(false); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', background: 'transparent', border: 'none',
                        cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Avatar name={u.name || 'U'} image={u.image} size="sm" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim()}>
            <Save size={14} /> {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CalendarPage (default export)                                     */
/* ------------------------------------------------------------------ */

type ViewMode = 'week' | 'month';

/* ------------------------------------------------------------------ */
/*  AgendaView (mobile) — chronological upcoming meetings as cards     */
/* ------------------------------------------------------------------ */
function AgendaView({ meetings, tasks, today, onMeetingClick, onTaskClick }: {
  meetings: Meeting[];
  tasks: CalTask[];
  today: Date;
  onMeetingClick: (m: Meeting) => void;
  onTaskClick: (t: CalTask) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const groups = useMemo(() => {
    const map = new Map<string, { date: Date; meetings: Meeting[]; tasks: CalTask[] }>();
    const bucket = (d0: Date) => {
      const d = new Date(d0);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { date: d, meetings: [], tasks: [] });
      return map.get(key)!;
    };
    for (const m of meetings) {
      if (m.scheduledAt) bucket(new Date(m.scheduledAt)).meetings.push(m);
    }
    for (const tk of tasks) {
      if (tk.dueDate) bucket(new Date(tk.dueDate)).tasks.push(tk);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => a.date.getTime() - b.date.getTime());
    for (const g of arr) {
      g.meetings.sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
    }
    return arr;
  }, [meetings, tasks]);

  const dayLabel = (d: Date) => {
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return t('common.today');
    if (diff === 1) return t('common.tomorrow');
    if (diff === -1) return t('common.yesterday');
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  if (groups.length === 0) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '48px 24px', textAlign: 'center', color: 'var(--muted)' }}>
        <Calendar size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{t('calendar.noScheduledMeetings')}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{t('calendar.emptyHint')}</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px clamp(14px, 4vw, 28px) 90px' }}>
      {groups.map((g) => {
        const isToday = g.date.getTime() === today.getTime();
        return (
          <div key={g.date.toISOString()} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--text-2)', textTransform: 'capitalize' }}>{dayLabel(g.date)}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{g.meetings.length + g.tasks.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {g.meetings.map((m) => {
                const start = new Date(m.scheduledAt!);
                const users = m.participants.map((p) => ({ name: p.user?.name || p.guestName || 'Guest', image: p.user?.image || null }));
                return (
                  <button key={m.id} onClick={() => onMeetingClick(m)} className="card" style={{
                    textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'center', padding: 16, width: '100%',
                  }}>
                    <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 46 }}>
                      <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>{fmtTime(start)}</div>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{t('calendar.durationMinShort', { count: m.durationMin })}</div>
                    </div>
                    <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', minHeight: 34 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AvatarStack users={users} max={4} />
                        {m.status === 'live' && (
                          <span className="chip" style={{ background: 'color-mix(in oklab, var(--red) 18%, transparent)', color: '#fca5a5', borderColor: 'color-mix(in oklab, var(--red) 35%, transparent)' }}>● {t('calendar.live')}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {g.tasks.map((tk) => {
                const accent = taskAccent(tk.priority);
                return (
                  <button key={tk.id} onClick={() => onTaskClick(tk)} className="card" style={{
                    textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'center', padding: 16, width: '100%',
                    borderLeft: `3px solid ${accent}`,
                  }}>
                    <div style={{ width: 46, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                      <ListChecks size={20} style={{ color: accent }} />
                    </div>
                    <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', minHeight: 34 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tk.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ textTransform: 'uppercase', letterSpacing: '.04em', color: accent, fontWeight: 600, fontSize: 10.5 }}>{t('calendar.deadline')}</span>
                        {tk.meeting?.title && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {tk.meeting.title}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [modal, setModal] = useState<{ date: Date; meetings: Meeting[]; tasks: CalTask[] } | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const weekStart = useMemo(() => startOfWeek(cursor), [cursor]);
  const currentYear = cursor.getFullYear();
  const currentMonth = cursor.getMonth();

  const monthLabel = useMemo(() => {
    const name = new Intl.DateTimeFormat(locale, { month: 'long' }).format(
      new Date(currentYear, currentMonth, 1),
    );
    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
    return `${capitalized} ${currentYear}`;
  }, [locale, currentYear, currentMonth]);

  /* ---- Fetch meetings ---- */
  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/meetings');
      if (res.ok) {
        const data: Meeting[] = await res.json();
        // Filter out ended meetings — they belong in archive
        setMeetings(data.filter((m: Meeting) => m.status !== "ended"));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  /* ---- Fetch task deadlines (accessible tasks that have a due date) ---- */
  useEffect(() => {
    fetch('/api/tasks?scope=all')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CalTask[]) => {
        if (Array.isArray(data)) {
          // Only tasks with a deadline; completed ones are dropped (a past
          // deadline that's already done just clutters the calendar).
          setTasks(data.filter((tk) => tk.dueDate && tk.status !== 'done'));
        }
      })
      .catch(() => {});
  }, []);

  /* ---- Navigation ---- */
  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCursor(d);
  };

  const goPrev = () => {
    setCursor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - (view === 'week' ? 7 : 30));
      return d;
    });
  };

  const goNext = () => {
    setCursor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + (view === 'week' ? 7 : 30));
      return d;
    });
  };

  /* ---- Meeting click handler ---- */
  const handleMeetingClick = useCallback(
    (m: Meeting) => {
      setSelectedMeeting(m);
    },
    [],
  );

  /* ---- Task deadline click → the task hub ---- */
  const handleTaskClick = useCallback(
    (_tk: CalTask) => {
      router.push('/tasks');
    },
    [router],
  );

  const handleDeleteMeeting = useCallback(async (m: Meeting) => {
    if (!confirm(t('calendar.deleteConfirm'))) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/meetings/' + m.id, { method: 'DELETE' });
      if (res.ok) {
        setSelectedMeeting(null);
        fetchMeetings();
      }
    } catch (e) { console.error(e); }
    finally { setDeleting(false); }
  }, [fetchMeetings, t]);

  const handleEditSave = useCallback((updated: Meeting) => {
    setEditMeeting(null);
    setSelectedMeeting(null);
    fetchMeetings();
  }, [fetchMeetings]);

  /* ---- Day click in month view ---- */
  const handleDayClick = useCallback(
    (date: Date, dayMeetings: Meeting[], dayTasks: CalTask[]) => {
      setModal({ date, meetings: dayMeetings, tasks: dayTasks });
    },
    [],
  );

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* ============ HEADER BAR ============ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '14px clamp(14px, 4vw, 28px)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          {isMobile ? t('nav.calendar') : monthLabel}
        </div>

        {!isMobile && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 14 }}>
            <button
              className="btn btn-icon"
              onClick={goPrev}
              title={t('calendar.previous')}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              className="btn btn-sm"
              onClick={goToday}
              style={{ fontWeight: 600 }}
            >
              {t('common.today')}
            </button>
            <button
              className="btn btn-icon"
              onClick={goNext}
              title={t('calendar.next')}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {/* View toggle (desktop only — mobile uses the agenda list) */}
          {!isMobile && (
            <div
              style={{
                display: 'flex',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 3,
              }}
            >
              {(['week', 'month'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="btn btn-sm"
                  style={{
                    background:
                      view === v ? 'var(--surface-3)' : 'transparent',
                    border: 'none',
                    borderRadius: 7,
                    fontWeight: view === v ? 600 : 500,
                  }}
                >
                  {v === 'week' ? t('calendar.week') : t('calendar.month')}
                </button>
              ))}
            </div>
          )}

          <Link
            href="/schedule"
            className="btn btn-primary"
            style={{ textDecoration: 'none', gap: 5 }}
          >
            <Plus size={15} /> {t('calendar.create')}
          </Link>
        </div>
      </div>

      {/* ============ CONTENT ============ */}
      {loading ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            gap: 8,
          }}
        >
          <RefreshCw
            size={16}
            style={{ animation: 'spin 1s linear infinite' }}
          />
          <span style={{ fontSize: 13 }}>{t('common.loading')}</span>
        </div>
      ) : isMobile ? (
        <AgendaView
          meetings={meetings}
          tasks={tasks}
          today={today}
          onMeetingClick={handleMeetingClick}
          onTaskClick={handleTaskClick}
        />
      ) : view === 'week' ? (
        <WeekView
          weekStart={weekStart}
          meetings={meetings}
          tasks={tasks}
          today={today}
          onMeetingClick={handleMeetingClick}
          onTaskClick={handleTaskClick}
        />
      ) : (
        <MonthView
          year={currentYear}
          month={currentMonth}
          meetings={meetings}
          tasks={tasks}
          today={today}
          onDayClick={handleDayClick}
          onTaskClick={handleTaskClick}
        />
      )}

      {/* ============ DAY MODAL ============ */}
      {modal && (
        <DayModal
          date={modal.date}
          meetings={modal.meetings}
          tasks={modal.tasks}
          onClose={() => setModal(null)}
          onMeetingClick={(m) => {
            setModal(null);
            handleMeetingClick(m);
          }}
          onTaskClick={(tk) => {
            setModal(null);
            handleTaskClick(tk);
          }}
        />
      )}

      {selectedMeeting && !editMeeting && (
        <MeetingDetailModal
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          onJoin={(m) => { setSelectedMeeting(null); }}
          onEdit={(m) => { setEditMeeting(m); }}
          onDelete={handleDeleteMeeting}
          deleting={deleting}
        />
      )}

      {editMeeting && (
        <CalendarEditModal
          meeting={editMeeting}
          onClose={() => setEditMeeting(null)}
          onSave={handleEditSave}
        />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
