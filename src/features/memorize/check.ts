import { parseReference, type Ref } from '@/lib/bible/refs';
import { verseCount } from '@/lib/bible/versification';

import { isLetter, normalizeWord, type Word, wordsOf } from './tokenize';

// Checking answers: first letters, typed words, whole verses (word diff), and references.

// ---------------------------------------------------------------------------------------------
// First letter

export type KeyResult = 'ok' | 'miss' | 'ignore';

/** Compares a typed key with a word's first letter. Case, accents, and non-letters are ignored. */
export function checkFirstLetter(word: Pick<Word, 'first'>, key: string): KeyResult {
  if (!isLetter(key)) return 'ignore';
  return normalizeWord(key)[0] === word.first ? 'ok' : 'miss';
}

export interface FirstLetterState {
  /** Index of the word waiting for its first letter. */
  index: number;
  /** Words that had a wrong letter (or were shown) before being revealed. */
  missed: boolean[];
  /** Wrong letters typed at each word, shown beside it. */
  wrong: string[][];
}

export function firstLetterStart(count: number): FirstLetterState {
  return { index: 0, missed: Array(count).fill(false), wrong: Array.from({ length: count }, () => []) };
}

/** Applies typed characters: a correct first letter reveals the word; a wrong one counts as a miss. */
export function firstLetterType(state: FirstLetterState, words: readonly Pick<Word, 'first'>[], typed: string): FirstLetterState {
  let { index } = state;
  let missed = state.missed;
  let wrong = state.wrong;
  for (const key of typed) {
    if (index >= words.length) break;
    const r = checkFirstLetter(words[index], key);
    if (r === 'ok') index++;
    else if (r === 'miss') {
      if (missed === state.missed) missed = [...missed];
      if (wrong === state.wrong) wrong = [...wrong];
      missed[index] = true;
      wrong[index] = [...wrong[index], key.toLowerCase()];
    }
  }
  return index === state.index && missed === state.missed ? state : { index, missed, wrong };
}

/** Reveals the current word without a letter (counted as missed). */
export function firstLetterShow(state: FirstLetterState, count: number): FirstLetterState {
  if (state.index >= count) return state;
  const missed = [...state.missed];
  missed[state.index] = true;
  return { ...state, index: state.index + 1, missed };
}

// ---------------------------------------------------------------------------------------------
// Typed words

/**
 * Lenient comparison for a single typed word: case, punctuation, spaces, accents, and the KJV's
 * apostrophes and hyphens are ignored, so "Lords", "lord's" and "LORD’S" all match "Lord’s", and
 * "loving-kindness" matches "lovingkindness".
 */
export function answerMatches(expected: string, typed: string): boolean {
  const want = normalizeWord(expected);
  return want.length > 0 && normalizeWord(typed) === want;
}

// ---------------------------------------------------------------------------------------------
// Word diff for reciting a whole verse

export type DiffKind = 'ok' | 'missed' | 'extra';

export interface DiffOp {
  kind: DiffKind;
  /** The expected word (ok, missed) or the typed word (extra). */
  text: string;
  /** Index of the expected word (ok, missed). */
  index?: number;
}

export interface DiffResult {
  ops: DiffOp[];
  correct: number;
  missed: string[];
  extra: string[];
  /** Expected words plus extra words: the denominator of the score. */
  total: number;
  /** 0–1: correct words over expected plus extra words. */
  accuracy: number;
}

/** Word-by-word comparison (longest common subsequence on normalized words). */
export function diffWords(expected: readonly string[], typed: readonly string[]): DiffResult {
  const a = expected.map(normalizeWord);
  const b = typed.map(normalizeWord).filter(Boolean);
  const typedWords = typed.filter((w) => normalizeWord(w));
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  // Suffix LCS lengths: lcs[i * w + j] = LCS of a[i..] and b[j..].
  const lcs = Math.min(n, m) < 65_535 ? new Uint16Array((n + 1) * w) : new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ kind: 'ok', text: expected[i], index: i });
      i++;
      j++;
    } else if (i < n && (j >= m || lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) {
      ops.push({ kind: 'missed', text: expected[i], index: i });
      i++;
    } else {
      ops.push({ kind: 'extra', text: typedWords[j] });
      j++;
    }
  }
  const correct = ops.filter((o) => o.kind === 'ok').length;
  const missed = ops.filter((o) => o.kind === 'missed').map((o) => o.text);
  const extra = ops.filter((o) => o.kind === 'extra').map((o) => o.text);
  const total = n + extra.length;
  return { ops, correct, missed, extra, total, accuracy: total ? correct / total : 0 };
}

/** Diff of typed text against the expected words. */
export function diffText(expected: readonly string[], typedText: string): DiffResult {
  return diffWords(expected, wordsOf(typedText));
}

// ---------------------------------------------------------------------------------------------
// References

export type RefCheck =
  /** Same verses. */
  | 'correct'
  /** Right book and the verses overlap, but not exactly. */
  | 'close'
  /** Right book and chapter, other verses. */
  | 'chapter'
  /** Right book, other chapter. */
  | 'book'
  /** Another book. */
  | 'wrong'
  /** Not a reference. */
  | 'invalid';

/** First and last verse covered by a ref, as [chapter, verse] pairs (chapter refs cover the chapter). */
export function refSpan(ref: Ref): [[number, number], [number, number]] {
  const endCh = ref.endChapter ?? ref.chapter;
  const start: [number, number] = [ref.chapter, ref.verse ?? 1];
  let endV: number;
  if (ref.verse === undefined) endV = verseCount(ref.book, endCh);
  else if (ref.endVerse !== undefined) endV = ref.endVerse;
  else endV = ref.endChapter !== undefined ? verseCount(ref.book, endCh) : ref.verse;
  return [start, [endCh, endV]];
}

const key = ([c, v]: [number, number]) => c * 1000 + v;

/** Checks a typed reference ("Rom 8:28", "romans 8 28") against the passage's reference. */
export function checkReference(typed: string, target: Ref): { result: RefCheck; parsed: Ref | null } {
  const parsed = typed.trim() ? parseReference(typed, verseCount) : null;
  if (!parsed) return { result: 'invalid', parsed: null };
  if (parsed.book !== target.book) return { result: 'wrong', parsed };
  const [ps, pe] = refSpan(parsed).map(key);
  const [ts, te] = refSpan(target).map(key);
  if (ps === ts && pe === te) return { result: 'correct', parsed };
  if (ps <= te && pe >= ts) return { result: 'close', parsed };
  if (parsed.chapter === target.chapter) return { result: 'chapter', parsed };
  return { result: 'book', parsed };
}

/** Number of verses a ref covers (KJV versification). */
export function refVerseTotal(ref: Ref): number {
  const [[sc, sv], [ec, ev]] = refSpan(ref);
  if (sc === ec) return ev - sv + 1;
  let n = verseCount(ref.book, sc) - sv + 1;
  for (let c = sc + 1; c < ec; c++) n += verseCount(ref.book, c);
  return n + ev;
}
