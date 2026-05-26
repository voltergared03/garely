'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { useIsMobile } from '@/lib/use-is-mobile';
import type { Meeting, CalTask } from './lib/types';
import { startOfWeek } from './lib/dates';
import { WeekView } from './components/WeekView';
import { MonthView } from './components/MonthView';
import { DayModal } from './components/DayModal';
import { MeetingDetailModal } from './components/MeetingDetailModal';
import { CalendarEditModal } from './components/CalendarEditModal';
import { AgendaView } from './components/AgendaView';

/* ------------------------------------------------------------------ */
/*  CalendarPage (default export)                                     */
/* ------------------------------------------------------------------ */

type ViewMode = 'week' | 'month';

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
