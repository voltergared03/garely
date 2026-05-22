'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  MONTHS_UA,
  MONTHS_UA_NOM,
  DOW_UA,
  DOW_FULL,
  fmtTime,
  fmtDateLong,
  pad,
} from '@/lib/utils';

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
/*  WeekView                                                          */
/* ------------------------------------------------------------------ */

function WeekView({
  weekStart,
  meetings,
  today,
  onMeetingClick,
}: {
  weekStart: Date;
  meetings: Meeting[];
  today: Date;
  onMeetingClick: (m: Meeting) => void;
}) {
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
                {DOW_UA[i]}
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

      {/* Time grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '64px repeat(7, 1fr)',
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
  today,
  onDayClick,
}: {
  year: number;
  month: number;
  meetings: Meeting[];
  today: Date;
  onDayClick: (date: Date, dayMeetings: Meeting[]) => void;
}) {
  const days = useMemo(() => getMonthGrid(year, month), [year, month]);

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
        {DOW_UA.map((d) => (
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
          const otherMonth = d.getMonth() !== month;
          const isToday = isSameDay(d, today);

          return (
            <button
              key={i}
              onClick={() => onDayClick(d, dayMeetings)}
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
                {dayMeetings.slice(0, 3).map((m) => {
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
                {dayMeetings.length > 3 && (
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                    +{dayMeetings.length - 3} ще
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
  onClose,
  onMeetingClick,
}: {
  date: Date;
  meetings: Meeting[];
  onClose: () => void;
  onMeetingClick: (m: Meeting) => void;
}) {
  const dowIdx = (date.getDay() + 6) % 7;

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
                {DOW_FULL[dowIdx]}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                }}
              >
                {fmtDateLong(date)}
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

          {/* Meeting list */}
          {meetings.length === 0 ? (
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
              <div style={{ marginBottom: 12 }}>Жодного мітингу.</div>
              <Link
                href="/schedule"
                className="btn btn-primary btn-sm"
                style={{ textDecoration: 'none', gap: 5 }}
                onClick={onClose}
              >
                <Plus size={13} /> Створити мітинг
              </Link>
            </div>
          ) : (
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
                            {users.length} учасн.
                          </span>
                          {m.recurrence && (
                            <span className="chip" style={{ fontSize: 10 }}>
                              <RefreshCw size={9} /> Щотижня
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
          width: 540, maxHeight: '85vh', overflow: 'auto',
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
              {m.status === 'scheduled' ? 'Заплановано' : m.status === 'live' ? 'Активний' : m.status === 'ended' ? 'Завершено' : m.status}
            </span>
            {m.recurrence && (
              <span className="chip" style={{ fontSize: 10 }}>
                <RefreshCw size={9} /> Повторюваний
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
                <Calendar size={13} /> {fmtDateLong(start)}
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={13} /> {m.durationMin} хв
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <UsersIcon size={13} /> {m.participants?.length || 0} учасників
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
                <ListChecks size={13} /> Питання для обговорення
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
                <UsersIcon size={13} /> Учасники
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
            Організатор: <strong style={{ color: 'var(--text-2)' }}>{m.createdBy?.name || 'Невідомо'}</strong>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {isCompleted && hasReport ? (
              <Link
                href={'/meetings/' + m.id + '/report'}
                className="btn btn-primary"
                style={{ textDecoration: 'none', flex: 1, justifyContent: 'center', fontWeight: 600 }}
                onClick={onClose}
              >
                <FileText size={15} /> Переглянути звіт
              </Link>
            ) : (
              <Link
                href={'/lobby/' + m.id}
                className="btn btn-primary"
                style={{ textDecoration: 'none', flex: 1, justifyContent: 'center', fontWeight: 600 }}
                onClick={onClose}
              >
                <Video size={15} /> {m.status === 'live' ? 'Приєднатися' : 'Увійти в мітинг'}
              </Link>
            )}
            {!isCompleted && (
              <button
                className="btn"
                onClick={() => onEdit(m)}
                style={{ flexShrink: 0 }}
              >
                <Pencil size={14} /> Редагувати
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
            <button className="btn" onClick={onClose} style={{ flexShrink: 0 }}>
              Закрити
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
          <div style={{ fontSize: 18, fontWeight: 700 }}>Редагувати мітинг</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Назва</label>
            <input className="field" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Опис</label>
            <textarea className="field" rows={2} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Опис, агенда..." style={{ resize: 'none' }} />
          </div>

          {/* Agenda */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="field-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <ListChecksIcon size={11} /> Питання ({agenda.length})
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
              <input className="field" placeholder="Додати питання..." value={newAgendaItem}
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
              <label className="field-label"><Calendar size={11} /> Дата</label>
              <input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ minWidth: 0 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="field-label">Час</label>
              <input className="field" type="time" value={time} onChange={e => setTime(e.target.value)} style={{ minWidth: 0 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="field-label">Тривалість</label>
              <Select value={String(duration)} onChange={(v) => setDuration(parseInt(v))} style={{ minWidth: 0 }}
                options={[15, 30, 45, 60, 90, 120].map(d => ({ value: String(d), label: `${d} хв` }))} />
            </div>
          </div>

          {/* Participants */}
          <div>
            <label className="field-label"><UsersIcon size={11} /> Учасники ({selectedUsers.length + 1})</label>
            {meeting.createdBy && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                background: 'var(--surface)', borderRadius: 8, marginBottom: 6, marginTop: 6,
              }}>
                <Avatar name={meeting.createdBy.name || 'U'} image={meeting.createdBy.image} size="sm" />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{meeting.createdBy.name}</div>
                <span className="chip" style={{ fontSize: 10 }}>Організатор</span>
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
                <input className="field" placeholder="Додати учасника..."
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
          <button className="btn" onClick={onClose}>Скасувати</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim()}>
            <Save size={14} /> {saving ? 'Зберігання...' : 'Зберегти'}
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

export default function CalendarPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [modal, setModal] = useState<{ date: Date; meetings: Meeting[] } | null>(null);
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

  const handleDeleteMeeting = useCallback(async (m: Meeting) => {
    if (!confirm('Видалити цей мітинг?')) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/meetings/' + m.id, { method: 'DELETE' });
      if (res.ok) {
        setSelectedMeeting(null);
        fetchMeetings();
      }
    } catch (e) { console.error(e); }
    finally { setDeleting(false); }
  }, [fetchMeetings]);

  const handleEditSave = useCallback((updated: Meeting) => {
    setEditMeeting(null);
    setSelectedMeeting(null);
    fetchMeetings();
  }, [fetchMeetings]);

  /* ---- Day click in month view ---- */
  const handleDayClick = useCallback(
    (date: Date, dayMeetings: Meeting[]) => {
      setModal({ date, meetings: dayMeetings });
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
          gap: 14,
          padding: '18px 28px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          {MONTHS_UA_NOM[currentMonth]} {currentYear}
        </div>

        <div style={{ display: 'flex', gap: 6, marginLeft: 14 }}>
          <button
            className="btn btn-icon"
            onClick={goPrev}
            title="Назад"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="btn btn-sm"
            onClick={goToday}
            style={{ fontWeight: 600 }}
          >
            Сьогодні
          </button>
          <button
            className="btn btn-icon"
            onClick={goNext}
            title="Вперед"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {/* View toggle */}
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
                {v === 'week' ? 'Тиждень' : 'Місяць'}
              </button>
            ))}
          </div>

          <Link
            href="/schedule"
            className="btn btn-primary"
            style={{ textDecoration: 'none', gap: 5 }}
          >
            <Plus size={15} /> Створити
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
          <span style={{ fontSize: 13 }}>Завантаження...</span>
        </div>
      ) : view === 'week' ? (
        <WeekView
          weekStart={weekStart}
          meetings={meetings}
          today={today}
          onMeetingClick={handleMeetingClick}
        />
      ) : (
        <MonthView
          year={currentYear}
          month={currentMonth}
          meetings={meetings}
          today={today}
          onDayClick={handleDayClick}
        />
      )}

      {/* ============ DAY MODAL ============ */}
      {modal && (
        <DayModal
          date={modal.date}
          meetings={modal.meetings}
          onClose={() => setModal(null)}
          onMeetingClick={(m) => {
            setModal(null);
            handleMeetingClick(m);
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
