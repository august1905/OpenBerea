import type { BookCode } from '@/lib/bible/books';
import { verseCount } from '@/lib/bible/versification';

// Inductive study: fixed, method-only prompts (no doctrinal content). Answers are never saved.

export type StepId = 'observe' | 'interpret' | 'apply';
export type PromptId = 'o1' | 'o2' | 'o3' | 'o4' | 'i1' | 'i2' | 'i3' | 'a1' | 'a2' | 'a3';

/** Prompt ids per step; the questions are in the translation file (study.ind.<id>). */
export const PROMPTS: Record<StepId, PromptId[]> = {
  observe: ['o1', 'o2', 'o3', 'o4'],
  interpret: ['i1', 'i2', 'i3'],
  apply: ['a1', 'a2', 'a3'],
};

/**
 * Reads the optional ?from=&to= verse range, clamped to the chapter. A missing or unreadable
 * `from` means the whole chapter; a missing `to` means through the end of the chapter.
 */
export function inductiveRange(book: BookCode, chapter: number, from?: string, to?: string): { from?: number; to?: number } {
  const last = verseCount(book, chapter);
  const f = Number(from);
  if (!from || !Number.isInteger(f) || f < 1 || f > last) return {};
  const t = Number(to);
  const end = to && Number.isInteger(t) ? Math.min(Math.max(t, f), last) : last;
  if (f === 1 && end === last) return {};
  return { from: f, to: end };
}
