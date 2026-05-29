'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ClipboardList, Check } from 'lucide-react';

interface QuizItem {
  id: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  meetingId: string;
  meetingTitle: string;
  questionCount: number;
}

/** Dashboard card: the current user's assigned comprehension quizzes. Renders
 *  nothing if the user has none. */
export function MyQuizzesCard() {
  const tr = useTranslations();
  const [items, setItems] = useState<QuizItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/quiz')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || items.length === 0) return null;
  const pending = items.filter((i) => i.status !== 'completed');

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: '-0.005em' }}>{tr('quiz.myQuizzes')}</h2>
        {pending.length > 0 && (
          <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 5, background: 'color-mix(in oklab, var(--accent) 18%, transparent)', color: 'var(--accent)', fontWeight: 600 }}>
            {tr('quiz.pendingCount', { count: pending.length })}
          </span>
        )}
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {items.slice(0, 6).map((it) => {
          const done = it.status === 'completed';
          return (
            <Link key={it.id} href={`/quiz/${it.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{
                  width: 32, height: 32, flexShrink: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? 'color-mix(in oklab, var(--green) 16%, transparent)' : 'color-mix(in oklab, var(--accent) 16%, transparent)',
                  color: done ? 'var(--green)' : 'var(--accent)',
                }}>
                  {done ? <Check size={16} /> : <ClipboardList size={16} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.meetingTitle}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {done ? tr('quiz.completedLabel') : tr('quiz.questionsCount', { count: it.questionCount })}
                  </div>
                </div>
                {done ? (
                  <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono, monospace)', color: 'var(--green)' }}>
                    {it.score}/{it.maxScore}
                  </span>
                ) : (
                  <span className="btn btn-sm btn-primary">{tr('quiz.take')}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
