'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ClipboardList, Check, X, ChevronDown, ChevronRight, Loader2, Users, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import s from './quizzes-panel.module.css';

interface MyItem {
  id: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  meetingId: string;
  meetingTitle: string;
  questionCount: number;
}
interface MgAssignment {
  id: string;
  user: { id: string; name: string; email?: string | null } | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  completedAt: string | null;
}
interface MgQuiz {
  quizId: string;
  meetingId: string;
  meetingTitle: string;
  questionCount: number;
  assignments: MgAssignment[];
}
interface ReviewQ { id: string; prompt: string; type: string; options: { id: string; text: string }[]; correctOptionIds: string[] }
interface Review {
  user: { name: string; email?: string | null } | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  meetingTitle: string;
  questions: ReviewQ[];
  answers: Record<string, string[]>;
}

/** The comprehension-quizzes hub (My quizzes + Assigned by me). Rendered as a
 *  tab inside the Tasks page. */
export function QuizzesPanel() {
  const tr = useTranslations();
  const [mine, setMine] = useState<MyItem[]>([]);
  const [managed, setManaged] = useState<MgQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/quiz').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/quizzes/managed').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ])
      .then(([m, g]) => {
        setMine(Array.isArray(m) ? m : []);
        setManaged(Array.isArray(g) ? g : []);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const deleteManaged = async (q: MgQuiz) => {
    if (!confirm(tr('quiz.deleteConfirm'))) return;
    try {
      const res = await fetch(`/api/meetings/${q.meetingId}/quiz`, { method: 'DELETE' });
      if (res.ok) setManaged((m) => m.filter((x) => x.quizId !== q.quizId));
    } catch {
      /* ignore */
    }
  };

  const openReview = useCallback(async (assignmentId: string) => {
    setReviewOpen(true);
    setReview(null);
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/quiz/${assignmentId}/review`);
      setReview(res.ok ? await res.json() : null);
    } catch {
      setReview(null);
    } finally {
      setReviewLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className={s.loadingWrap}>
        <Loader2 size={24} className={s.spinner} />
      </div>
    );
  }

  const empty = mine.length === 0 && managed.length === 0;

  return (
    <div className={s.scroll}>
      <div className={s.container}>
        {empty && (
          <div className={`card ${s.emptyCard}`}>
            <ClipboardList size={28} className={s.emptyIcon} />
            <div className={s.emptyText}>{tr('quiz.noMine')}</div>
          </div>
        )}

        {/* My quizzes */}
        {mine.length > 0 && (
          <section>
            <h2 className={s.sectionTitle}>{tr('quiz.myQuizzes')}</h2>
            <div className={`card ${s.listCard}`}>
              {mine.map((it) => {
                const done = it.status === 'completed';
                return (
                  <Link key={it.id} href={`/quiz/${it.id}`} className={s.rowLink}>
                    <div className={s.row}>
                      <span
                        className={s.statusIcon}
                        style={{
                          background: done ? 'color-mix(in oklab, var(--green) 16%, transparent)' : 'color-mix(in oklab, var(--accent) 16%, transparent)',
                          color: done ? 'var(--green)' : 'var(--accent)',
                        }}
                      >
                        {done ? <Check size={16} /> : <ClipboardList size={16} />}
                      </span>
                      <div className={s.grow}>
                        <div className={s.rowTitle}>{it.meetingTitle}</div>
                        <div className={s.rowSub}>
                          {done ? tr('quiz.completedLabel') : tr('quiz.questionsCount', { count: it.questionCount })}
                        </div>
                      </div>
                      {done ? (
                        <span className={s.scoreLabel}>{it.score}/{it.maxScore}</span>
                      ) : (
                        <span className="btn btn-sm btn-primary">{tr('quiz.take')}</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Assigned by me (admin / creator) */}
        {managed.length > 0 && (
          <section>
            <h2 className={s.sectionTitle}>{tr('quiz.tabManaged')}</h2>
            <div className={s.managedList}>
              {managed.map((q) => {
                const open = expanded.has(q.quizId);
                const doneCount = q.assignments.filter((a) => a.status === 'completed').length;
                return (
                  <div key={q.quizId} className={`card ${s.listCard}`}>
                    <div className={s.rowHead}>
                      <button
                        onClick={() => toggle(q.quizId)}
                        className={s.toggleBtn}
                      >
                        {open ? <ChevronDown size={16} className={s.mutedIcon} /> : <ChevronRight size={16} className={s.mutedIcon} />}
                        <div className={s.grow}>
                          <div className={s.managedTitle}>{q.meetingTitle}</div>
                          <div className={s.rowSub}>{tr('quiz.progress', { done: doneCount, total: q.assignments.length })}</div>
                        </div>
                        <Users size={14} className={s.mutedIcon} />
                        <span className={s.countLabel}>{q.assignments.length}</span>
                      </button>
                      <button onClick={() => deleteManaged(q)} title={tr('quiz.delete')} aria-label={tr('quiz.delete')}
                        className={s.deleteBtn}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {open && (
                      <div className={s.expandedList}>
                        {q.assignments.map((a) => {
                          const adone = a.status === 'completed';
                          return (
                            <div key={a.id} className={s.assignmentRow}>
                              <span className={s.assignmentName}>
                                {a.user?.name || a.user?.email || '—'}
                              </span>
                              {adone ? (
                                <>
                                  <span className={s.scoreLabel}>{a.score}/{a.maxScore}</span>
                                  <button className={`btn btn-ghost btn-sm ${s.viewBtn}`} onClick={() => openReview(a.id)}>
                                    {tr('quiz.viewAnswers')}
                                  </button>
                                </>
                              ) : (
                                <span className={s.notTakenLabel}>{tr('quiz.notTaken')}</span>
                              )}
                            </div>
                          );
                        })}
                        <Link href={`/meetings/${q.meetingId}/report`} className={s.reportLink}>
                          {tr('quiz.openReport')} &rarr;
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Review modal (admin) */}
      <Modal open={reviewOpen} onClose={() => { setReviewOpen(false); setReview(null); }} title={review?.user?.name ? tr('quiz.reviewOf', { name: review.user.name }) : tr('quiz.viewAnswers')} width={640}>
        {reviewLoading || !review ? (
          <div className={s.modalLoading}>
            {reviewLoading ? <Loader2 size={20} className={s.spinner} /> : <span className={s.loadErrorText}>{tr('quiz.loadError')}</span>}
          </div>
        ) : (
          <div className={s.reviewList}>
            <div className={s.reviewMeta}>
              {review.meetingTitle} · <span className={s.reviewScore}>{review.score}/{review.maxScore}</span>
            </div>
            {review.questions.map((q, qi) => {
              const sel = review.answers[q.id] || [];
              return (
                <div key={q.id} className={`card ${s.questionCard}`}>
                  <div className={s.questionPrompt}>{qi + 1}. {q.prompt}</div>
                  <div className={s.optionsList}>
                    {q.options.map((o) => {
                      const isCorrect = q.correctOptionIds.includes(o.id);
                      const picked = sel.includes(o.id);
                      let color = 'var(--text-2)';
                      let icon = null as React.ReactNode;
                      if (isCorrect) { color = 'var(--green)'; icon = <Check size={13} />; }
                      else if (picked) { color = 'var(--danger-fg)'; icon = <X size={13} />; }
                      return (
                        <div key={o.id} className={s.optionRow} style={{ color }}>
                          <span className={s.optionIconWrap}>{icon}</span>
                          <span style={{ fontWeight: picked ? 600 : 400 }}>{o.text}</span>
                          {picked && <span className={s.pickedNote}>({tr('quiz.userPicked')})</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
