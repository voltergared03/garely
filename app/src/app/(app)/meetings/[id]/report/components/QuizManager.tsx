'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ClipboardList, Wand2, Plus, Trash2, Check, Loader2, BookOpen, BookLock } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useTransientMessage } from '@/hooks/use-transient-message';
import type { Participant } from '../lib/types';
import type { QuizQuestion } from '@/lib/quiz';
import s from './QuizManager.module.css';

interface Assignment {
  id: string;
  user: { id: string; name: string; email?: string | null } | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  completedAt: string | null;
}
interface QuizData {
  id: string;
  status: string;
  openBook: boolean;
  questions: QuizQuestion[];
  assignments?: Assignment[];
}

const uid = () => Math.random().toString(36).slice(2, 8);

/** Admin/creator-only: generate, edit and assign a post-meeting comprehension quiz. */
export function QuizManager({
  meetingId,
  participants,
  reportReady,
  canManage,
}: {
  meetingId: string;
  participants: Participant[];
  reportReady: boolean;
  canManage: boolean;
}) {
  const tr = useTranslations();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [openBook, setOpenBook] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [msg, showMsg] = useTransientMessage();

  const registered = participants.filter((p) => p.user);
  const assignments = quiz?.assignments ?? [];

  const openModal = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/quiz`);
      const data = res.ok ? await res.json() : {};
      const q: QuizData | null = data.quiz || null;
      setQuiz(q);
      setQuestions(q?.questions ?? []);
      setOpenBook(!!q?.openBook);
      const assignedIds = new Set((q?.assignments ?? []).map((a) => a.user?.id).filter(Boolean));
      // Pre-select registered participants who aren't assigned yet.
      setSelected(new Set(registered.map((p) => p.user!.id).filter((uidv) => !assignedIds.has(uidv))));
    } catch {
      setQuiz(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/quiz/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openBook }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showMsg(false, data.error === 'report_not_ready' ? tr('quiz.reportNotReady') : tr('quiz.generateFailed'));
        return;
      }
      setQuestions(data.quiz?.questions ?? []);
    } catch {
      showMsg(false, tr('quiz.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }, [meetingId, openBook, tr, showMsg]);

  /* ── question editing (immutable) ── */
  const setQ = (qi: number, patch: Partial<QuizQuestion>) =>
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)));
  const setOptText = (qi: number, oi: number, text: string) =>
    setQuestions((qs) =>
      qs.map((q, i) => (i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, text } : o)) } : q)),
    );
  const toggleCorrect = (qi: number, optId: string) =>
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qi) return q;
        if (q.type === 'single') return { ...q, correctOptionIds: [optId] };
        const has = q.correctOptionIds.includes(optId);
        return { ...q, correctOptionIds: has ? q.correctOptionIds.filter((c) => c !== optId) : [...q.correctOptionIds, optId] };
      }),
    );
  const setType = (qi: number, type: 'single' | 'multi') =>
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qi ? { ...q, type, correctOptionIds: type === 'single' ? q.correctOptionIds.slice(0, 1) : q.correctOptionIds } : q,
      ),
    );
  const addOption = (qi: number) =>
    setQuestions((qs) =>
      qs.map((q, i) => (i === qi ? { ...q, options: [...q.options, { id: `o_${uid()}`, text: '' }] } : q)),
    );
  const deleteOption = (qi: number, optId: string) =>
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qi && q.options.length > 2
          ? { ...q, options: q.options.filter((o) => o.id !== optId), correctOptionIds: q.correctOptionIds.filter((c) => c !== optId) }
          : q,
      ),
    );
  const addQuestion = () =>
    setQuestions((qs) => [
      ...qs,
      { id: `q_${uid()}`, prompt: '', type: 'single', options: [{ id: `o_${uid()}`, text: '' }, { id: `o_${uid()}`, text: '' }], correctOptionIds: [], cites: [] },
    ]);
  const deleteQuestion = (qi: number) => setQuestions((qs) => qs.filter((_, i) => i !== qi));

  /* ── validation ── */
  function validate(): string | null {
    if (questions.length === 0) return tr('quiz.errNoQuestions');
    for (const q of questions) {
      if (!q.prompt.trim()) return tr('quiz.errEmptyPrompt');
      const opts = q.options.filter((o) => o.text.trim());
      if (opts.length < 2) return tr('quiz.errFewOptions');
      const validCorrect = q.correctOptionIds.filter((c) => q.options.some((o) => o.id === c && o.text.trim()));
      if (validCorrect.length < 1) return tr('quiz.errNoCorrect');
    }
    return null;
  }

  const saveAndAssign = useCallback(async () => {
    const err = validate();
    if (err) { showMsg(false, err); return; }
    if (selected.size === 0) { showMsg(false, tr('quiz.errNoUsers')); return; }
    setAssigning(true);
    try {
      // 1) persist the (possibly edited) questions + openBook
      const patch = await fetch(`/api/meetings/${meetingId}/quiz`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions, openBook }),
      });
      if (!patch.ok) { showMsg(false, tr('quiz.saveFailed')); return; }
      // 2) assign to the selected participants
      const res = await fetch(`/api/meetings/${meetingId}/quiz/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(false, tr('quiz.assignFailed')); return; }
      showMsg(true, tr('quiz.assignedCount', { count: data.assigned ?? 0 }));
      // refresh quiz/results
      const ref = await fetch(`/api/meetings/${meetingId}/quiz`);
      if (ref.ok) {
        const rd = await ref.json();
        setQuiz(rd.quiz || null);
        setSelected(new Set());
      }
    } catch {
      showMsg(false, tr('quiz.assignFailed'));
    } finally {
      setAssigning(false);
    }
  }, [meetingId, questions, openBook, selected, tr, showMsg]);

  const deleteQuiz = useCallback(async () => {
    if (!confirm(tr('quiz.deleteConfirm'))) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/quiz`, { method: 'DELETE' });
      if (!res.ok) {
        showMsg(false, tr('quiz.deleteFailed'));
        return;
      }
      setQuiz(null);
      setQuestions([]);
      setSelected(new Set());
      setOpen(false);
    } catch {
      showMsg(false, tr('quiz.deleteFailed'));
    } finally {
      setAssigning(false);
    }
  }, [meetingId, tr, showMsg]);

  if (!canManage) return null;

  return (
    <>
      <button
        className="btn btn-sm"
        onClick={openModal}
        disabled={!reportReady}
        title={reportReady ? undefined : tr('quiz.needReport')}
        style={{ opacity: reportReady ? 1 : 0.5 }}
      >
        <ClipboardList size={13} /> {tr('quiz.assignButton')}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={tr('quiz.title')} width={680}>
        {loading ? (
          <div className={s.loadingWrap}>
            <Loader2 size={22} className={s.spinMuted} />
          </div>
        ) : (
          <div className={s.body}>
            {/* Existing results */}
            {assignments.length > 0 && (
              <div>
                <div className={s.sectionLabelBlock}>
                  {tr('quiz.results')}
                </div>
                <div className={`card ${s.resultsCard}`}>
                  {assignments.map((a) => (
                    <div key={a.id} className={s.resultRow}>
                      <span className={s.ellipsis}>{a.user?.name || a.user?.email || '—'}</span>
                      {a.status === 'completed' ? (
                        <span className={s.scoreText}>{a.score}/{a.maxScore}</span>
                      ) : (
                        <span className={s.pendingText}>{tr('quiz.pending')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Participants */}
            <div>
              <div className={s.rowBetween}>
                <span className={s.sectionLabel}>
                  {tr('quiz.selectParticipants')}
                </span>
                {registered.length > 0 && (
                  <button
                    className={`btn btn-ghost btn-sm ${s.selectAllBtn}`}
                    onClick={() =>
                      setSelected((sel) => (sel.size === registered.length ? new Set() : new Set(registered.map((p) => p.user!.id))))
                    }
                  >
                    {selected.size === registered.length ? tr('quiz.clearAll') : tr('quiz.selectAll')}
                  </button>
                )}
              </div>
              {registered.length === 0 ? (
                <div className={s.emptyNote}>{tr('quiz.noRegistered')}</div>
              ) : (
                <div className={s.chipsWrap}>
                  {registered.map((p) => {
                    const id = p.user!.id;
                    const on = selected.has(id);
                    return (
                      <button
                        key={id}
                        onClick={() => setSelected((sel) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                        className={s.chip}
                        style={{
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                          background: on ? 'color-mix(in oklab, var(--accent) 16%, transparent)' : 'transparent',
                          color: on ? 'var(--text)' : 'var(--muted)',
                        }}
                      >
                        {on && <Check size={12} />}
                        {p.user!.name || p.user!.email}
                      </button>
                    );
                  })}
                </div>
              )}
              {participants.some((p) => !p.user && p.guestName) && (
                <div className={s.guestNote}>{tr('quiz.guestsCantTake')}</div>
              )}
            </div>

            {/* Open-book toggle */}
            <button
              onClick={() => setOpenBook((v) => !v)}
              className={s.openBookBtn}
            >
              {openBook ? <BookOpen size={16} style={{ color: 'var(--accent)' }} /> : <BookLock size={16} style={{ color: 'var(--muted)' }} />}
              <span className={s.flexOne}>
                <span className={s.openBookTitle}>{tr('quiz.openBook')}</span>
                <span className={s.openBookHint}>{tr('quiz.openBookHint')}</span>
              </span>
              <span
                className={s.toggleTrack}
                style={{ background: openBook ? 'var(--accent)' : 'var(--surface-3, rgba(255,255,255,.1))' }}
              >
                <span className={s.toggleThumb} style={{ left: openBook ? 19 : 3, background: '#fff' }} />
              </span>
            </button>

            {/* Questions */}
            <div>
              <div className={s.rowBetween}>
                <span className={s.sectionLabel}>
                  {tr('quiz.questions')} {questions.length > 0 && `(${questions.length})`}
                </span>
                <button className="btn btn-sm" onClick={generate} disabled={generating}>
                  {generating ? <Loader2 size={13} className={s.spin} /> : <Wand2 size={13} />}
                  {questions.length > 0 ? tr('quiz.regenerate') : tr('quiz.generate')}
                </button>
              </div>

              {questions.length === 0 && !generating && (
                <div className={s.generateHint}>{tr('quiz.generateHint')}</div>
              )}

              <div className={s.questionsList}>
                {questions.map((q, qi) => (
                  <div key={q.id} className={`card ${s.questionCard}`}>
                    <div className={s.questionHeader}>
                      <span className={s.questionIndex}>{qi + 1}.</span>
                      <textarea
                        value={q.prompt}
                        onChange={(e) => setQ(qi, { prompt: e.target.value })}
                        placeholder={tr('quiz.promptPlaceholder')}
                        rows={2}
                        className={`${s.input} ${s.textarea}`}
                      />
                      <button onClick={() => deleteQuestion(qi)} title={tr('common.delete')} aria-label={tr('common.delete')}
                        className={s.iconDangerBtn}>
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className={s.typeRow}>
                      {(['single', 'multi'] as const).map((t) => (
                        <button key={t} onClick={() => setType(qi, t)}
                          className={s.typeBtn}
                          style={{
                            border: `1px solid ${q.type === t ? 'var(--accent)' : 'var(--border)'}`,
                            background: q.type === t ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'transparent',
                            color: q.type === t ? 'var(--text)' : 'var(--muted)',
                          }}>
                          {t === 'single' ? tr('quiz.typeSingle') : tr('quiz.typeMulti')}
                        </button>
                      ))}
                    </div>

                    <div className={s.optionsList}>
                      {q.options.map((o, oi) => {
                        const correct = q.correctOptionIds.includes(o.id);
                        return (
                          <div key={o.id} className={s.optionRow}>
                            <button
                              onClick={() => toggleCorrect(qi, o.id)}
                              title={tr('quiz.markCorrect')}
                              aria-label={tr('quiz.markCorrect')}
                              className={s.correctBtn}
                              style={{
                                borderRadius: q.type === 'single' ? '50%' : 6,
                                border: `1.5px solid ${correct ? 'var(--green)' : 'var(--border)'}`,
                                background: correct ? 'var(--green)' : 'transparent',
                              }}>
                              {correct && <Check size={12} className={s.onAccent} />}
                            </button>
                            <input value={o.text} onChange={(e) => setOptText(qi, oi, e.target.value)} placeholder={tr('quiz.optionPlaceholder')} className={s.input} />
                            {q.options.length > 2 && (
                              <button onClick={() => deleteOption(qi, o.id)} aria-label={tr('common.delete')}
                                className={s.iconMutedBtn}>
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <button className={`btn btn-ghost btn-sm ${s.addOptionBtn}`} onClick={() => addOption(qi)}>
                        <Plus size={12} /> {tr('quiz.addOption')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {questions.length > 0 && (
                <button className={`btn btn-ghost btn-sm ${s.addQuestionBtn}`} onClick={addQuestion}>
                  <Plus size={13} /> {tr('quiz.addQuestion')}
                </button>
              )}
            </div>

            {/* Footer */}
            <div className={s.footer}>
              {quiz || questions.length > 0 ? (
                <button onClick={deleteQuiz} disabled={assigning}
                  className={s.deleteQuizBtn}>
                  <Trash2 size={13} /> {tr('quiz.delete')}
                </button>
              ) : <span />}
              <div className={s.footerRight}>
                <span style={{ fontSize: 12.5, color: msg ? (msg.ok ? 'var(--green)' : 'var(--danger-fg)') : 'var(--muted)' }}>
                  {msg ? msg.text : tr('quiz.selectedCount', { count: selected.size })}
                </span>
                <button className="btn btn-primary" onClick={saveAndAssign} disabled={assigning || questions.length === 0 || selected.size === 0}>
                  {assigning ? <Loader2 size={14} className={s.spin} /> : <ClipboardList size={14} />}
                  {tr('quiz.assignButton')}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
