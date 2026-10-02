// Chapter mode: split a long passage into chunks of about three verses (adjusted to verse length),
// chain verses together (1, 1–2, 1–3, …), or run the whole passage.

/** Inclusive range of verse positions within the passage (0-based). */
export interface Span {
  start: number;
  end: number;
}

/** More verses than this (or a whole chapter) turns on chapter mode. */
export const CHAPTER_MODE_MIN_VERSES = 6;

export function isChapterLength(isWholeChapter: boolean, verses: number): boolean {
  return isWholeChapter || verses >= CHAPTER_MODE_MIN_VERSES;
}

/**
 * Groups verses into chunks of about `per` verses. The target is `per` times the passage's average
 * verse length in words (kept between 30 and 80 words), so long verses make smaller chunks and short
 * verses make larger ones. A short last chunk joins the one before it.
 */
export function chunkVerses(wordCounts: readonly number[], per = 3): Span[] {
  const n = wordCounts.length;
  if (!n) return [];
  const total = wordCounts.reduce((a, b) => a + b, 0);
  const target = Math.min(80, Math.max(30, (total / n) * per));
  const limit = target * 1.2;
  const maxVerses = per + 2;
  const chunks: Span[] = [];
  let start = 0;
  let words = 0;
  for (let i = 0; i < n; i++) {
    const count = i - start;
    if (count > 0 && (words + wordCounts[i] > limit || count >= maxVerses)) {
      chunks.push({ start, end: i - 1 });
      start = i;
      words = 0;
    }
    words += wordCounts[i];
  }
  chunks.push({ start, end: n - 1 });

  // Fold a short final chunk into the previous one when the result stays reasonable.
  if (chunks.length > 1) {
    const lastChunk = chunks[chunks.length - 1];
    const prev = chunks[chunks.length - 2];
    const sum = (s: Span) => wordCounts.slice(s.start, s.end + 1).reduce((a, b) => a + b, 0);
    const merged = sum(prev) + sum(lastChunk);
    if (sum(lastChunk) < target / 2 && merged <= target * 1.5 && lastChunk.end - prev.start + 1 <= maxVerses) {
      chunks.splice(chunks.length - 2, 2, { start: prev.start, end: lastChunk.end });
    }
  }
  return chunks;
}

/** Chain steps: verse 1, then 1–2, then 1–3, … up to the whole passage. */
export function chainSteps(verseTotal: number): Span[] {
  return Array.from({ length: verseTotal }, (_, i) => ({ start: 0, end: i }));
}

export type Part = { kind: 'chunk'; index: number } | { kind: 'chain'; index: number } | { kind: 'all' };

/** "chunk-2", "chain-3", "all" (1-based in the URL). */
export function parsePart(value: string | undefined | null): Part | null {
  if (!value) return null;
  if (value === 'all') return { kind: 'all' };
  const m = /^(chunk|chain)-(\d+)$/.exec(value);
  if (!m) return null;
  const index = Number(m[2]) - 1;
  return index >= 0 ? { kind: m[1] as 'chunk' | 'chain', index } : null;
}

export function formatPart(part: Part): string {
  return part.kind === 'all' ? 'all' : `${part.kind}-${part.index + 1}`;
}

/** The verse span a part selects, or null when it is out of range. */
export function partSpan(part: Part, chunks: readonly Span[], verseTotal: number): Span | null {
  if (part.kind === 'all') return verseTotal ? { start: 0, end: verseTotal - 1 } : null;
  if (part.kind === 'chunk') return chunks[part.index] ?? null;
  return part.index < verseTotal ? { start: 0, end: part.index } : null;
}

/** The part after this one (next chunk or next chain step), if any. */
export function nextPart(part: Part, chunkTotal: number, verseTotal: number): Part | null {
  if (part.kind === 'chunk') return part.index + 1 < chunkTotal ? { kind: 'chunk', index: part.index + 1 } : null;
  if (part.kind === 'chain') return part.index + 1 < verseTotal ? { kind: 'chain', index: part.index + 1 } : null;
  return null;
}

/** The part to practice: the one in the URL when valid, else the first chunk (chapter mode) or all. */
export function resolvePart(chapterMode: boolean, param: string | undefined | null, chunks: readonly Span[], verseTotal: number): Part {
  if (!chapterMode) return { kind: 'all' };
  const requested = parsePart(param);
  return requested && partSpan(requested, chunks, verseTotal) ? requested : { kind: 'chunk', index: 0 };
}
