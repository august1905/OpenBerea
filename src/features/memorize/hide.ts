import { shuffle } from './shuffle';
import type { Word } from './tokenize';

// Progressive hiding and fill in the blank: which words are hidden.

/** Share of words hidden in each round after the first read-through. */
export const HIDE_STEPS = [0.2, 0.4, 0.6, 0.8, 1] as const;

/**
 * Number of hidden words in each round: round 0 shows everything, then each round hides more
 * (20%, 40%, … 100%), always at least one more word than before, ending with every word hidden.
 */
export function hideCounts(wordTotal: number, steps: readonly number[] = HIDE_STEPS): number[] {
  const counts = [0];
  for (const f of steps) {
    const prev = counts[counts.length - 1];
    if (prev >= wordTotal) break;
    counts.push(Math.min(wordTotal, Math.max(prev + 1, Math.ceil(f * wordTotal))));
  }
  if (counts[counts.length - 1] < wordTotal) counts.push(wordTotal);
  return counts;
}

/** The order words disappear in. Each round hides a prefix of it, so hidden words stay hidden. */
export function hideOrder(wordTotal: number, seed: number): number[] {
  return shuffle(
    Array.from({ length: wordTotal }, (_, i) => i),
    seed,
  );
}

/** Word positions hidden in a round. */
export function hiddenInRound(order: readonly number[], counts: readonly number[], round: number): Set<number> {
  const k = counts[Math.max(0, Math.min(round, counts.length - 1))];
  return new Set(order.slice(0, k));
}

// Common function words: never chosen as blanks, so the blanks fall on the words worth remembering.
const FUNCTION_WORDS = new Set(
  (
    'a an and are as at be but by did do for from had has hath have he her him his i if in into is it its ' +
    'me my mine nor not o of on or our out shall she so than that the thee their them then there they thine ' +
    'this thou thy to unto up upon us was we were which who whom will with ye yea you your'
  ).split(' '),
);

/** True for a content word that makes a good blank. */
export function isKeyWord(word: Pick<Word, 'norm'>): boolean {
  return word.norm.length >= 3 && !FUNCTION_WORDS.has(word.norm);
}

/**
 * Picks about a quarter of the words as blanks, preferring key words and avoiding two blanks side by
 * side. Returns sorted word positions; there is always at least one blank.
 */
export function pickBlanks(words: readonly Pick<Word, 'norm'>[], seed: number, ratio = 0.25): number[] {
  if (!words.length) return [];
  const want = Math.max(1, Math.round(words.length * ratio));
  const keys = words.map((w, i) => (isKeyWord(w) ? i : -1)).filter((i) => i >= 0);
  const pool = shuffle(keys.length ? keys : words.map((_, i) => i), seed);
  const chosen = new Set<number>();
  for (const i of pool) {
    if (chosen.size >= want) break;
    if (!chosen.has(i - 1) && !chosen.has(i + 1)) chosen.add(i);
  }
  for (const i of pool) {
    if (chosen.size >= want) break;
    chosen.add(i);
  }
  return [...chosen].sort((a, b) => a - b);
}
