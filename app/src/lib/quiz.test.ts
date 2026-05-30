import { describe, it, expect } from 'vitest';
import { gradeQuiz, type QuizQuestion } from './quiz';

const q = (id: string, type: 'single' | 'multi', correct: string[]): QuizQuestion => ({
  id,
  prompt: '?',
  type,
  options: [
    { id: 'o1', text: 'a' },
    { id: 'o2', text: 'b' },
    { id: 'o3', text: 'c' },
  ],
  correctOptionIds: correct,
  cites: [],
});

describe('gradeQuiz', () => {
  it('scores exact single-answer matches', () => {
    const qs = [q('q1', 'single', ['o1']), q('q2', 'single', ['o2'])];
    expect(gradeQuiz(qs, { q1: ['o1'], q2: ['o2'] })).toEqual({ score: 2, maxScore: 2 });
    expect(gradeQuiz(qs, { q1: ['o1'], q2: ['o1'] })).toEqual({ score: 1, maxScore: 2 });
  });

  it('multi-answer needs the EXACT set (order-independent, no partial credit)', () => {
    const qs = [q('q1', 'multi', ['o1', 'o2'])];
    expect(gradeQuiz(qs, { q1: ['o1', 'o2'] }).score).toBe(1);
    expect(gradeQuiz(qs, { q1: ['o2', 'o1'] }).score).toBe(1); // order doesn't matter
    expect(gradeQuiz(qs, { q1: ['o1'] }).score).toBe(0); // missing one → wrong
    expect(gradeQuiz(qs, { q1: ['o1', 'o2', 'o3'] }).score).toBe(0); // extra → wrong
  });

  it('counts unanswered / empty as wrong', () => {
    const qs = [q('q1', 'single', ['o1'])];
    expect(gradeQuiz(qs, {}).score).toBe(0);
    expect(gradeQuiz(qs, { q1: [] }).score).toBe(0);
    expect(gradeQuiz([], {})).toEqual({ score: 0, maxScore: 0 });
  });
});
