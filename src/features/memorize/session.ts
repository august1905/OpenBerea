import { createStore, useStore } from '@/lib/state/store';

import type { Mode } from './modes';

// The session score: accuracy and missed words for this visit only. It lives in memory (never in
// cookies, localStorage, sessionStorage, or IndexedDB), so a reload or a closed page clears it.

export interface Attempt {
  id: number;
  /** Compact ref of the unit practiced. */
  ref: string;
  tr: string;
  mode: Mode;
  /** Items answered so far (words, blanks, or references). */
  answered: number;
  correct: number;
  /** Words (or references) missed, in order. */
  missed: string[];
  done: boolean;
}

export interface SessionState {
  attempts: Attempt[];
}

export const sessionStore = createStore<SessionState>({ attempts: [] });

/** Seed for this visit's shuffles; a new one each time the page loads. */
export const sessionSeed = (Math.random() * 0x1_0000_0000) >>> 0;

let nextId = 1;

export function newAttemptId(): number {
  return nextId++;
}

export interface Report {
  answered: number;
  correct: number;
  missed: string[];
  done: boolean;
}

/** Adds or updates an attempt. Attempts with nothing answered yet are left out. */
export function upsertAttempt(state: SessionState, attempt: Attempt): SessionState {
  const others = state.attempts.filter((a) => a.id !== attempt.id);
  if (!attempt.answered && !attempt.missed.length) {
    return others.length === state.attempts.length ? state : { attempts: others };
  }
  const i = state.attempts.findIndex((a) => a.id === attempt.id);
  const attempts = [...state.attempts];
  if (i >= 0) attempts[i] = attempt;
  else attempts.push(attempt);
  return { attempts };
}

export function recordAttempt(attempt: Attempt) {
  sessionStore.set((s) => upsertAttempt(s, attempt));
}

export function clearSession() {
  sessionStore.set({ attempts: [] });
}

export interface SessionSummary {
  answered: number;
  correct: number;
  /** 0–1, or null when nothing has been answered. */
  accuracy: number | null;
  /** Distinct passages practiced. */
  passages: number;
  /** Missed words with counts, most missed first (ties keep first-missed order). */
  missed: { word: string; count: number }[];
}

export function summarize(state: SessionState): SessionSummary {
  let answered = 0;
  let correct = 0;
  const counts = new Map<string, { word: string; count: number; order: number }>();
  let order = 0;
  for (const a of state.attempts) {
    answered += a.answered;
    correct += a.correct;
    for (const w of a.missed) {
      const key = w.toLowerCase().replace(/[^\p{L}\p{N}:]/gu, '');
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { word: w, count: 1, order: order++ });
    }
  }
  const missed = [...counts.values()].sort((a, b) => b.count - a.count || a.order - b.order).map(({ word, count }) => ({ word, count }));
  const passages = new Set(state.attempts.map((a) => `${a.tr}:${a.ref}`)).size;
  return { answered, correct, accuracy: answered ? correct / answered : null, passages, missed };
}

export function useSession(): SessionSummary {
  const state = useStore(sessionStore);
  return summarize(state);
}

/** Percentage for display, e.g. 0.923 → 92. */
export function percent(fraction: number): number {
  return Math.round(fraction * 100);
}
