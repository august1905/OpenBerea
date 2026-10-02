import { type BookCode, bookInfo } from './books';
import counts from './versification.json';

// KJV versification: verse counts per chapter, in canonical book order. Generated from the KJV verse
// list (31,102 verses) and checked against the CrossWire KJV module by the data pipeline.
const VERSES = counts as number[][];

export function verseCount(book: BookCode, chapter: number): number {
  return VERSES[bookInfo(book).index - 1]?.[chapter - 1] ?? 0;
}

export const TOTAL_VERSES = VERSES.flat().reduce((a, b) => a + b, 0);

/** Position of a verse in canonical order (0-based), matching the search corpus arrays. */
export function verseOrdinal(book: BookCode, chapter: number, verse: number): number {
  const bi = bookInfo(book).index - 1;
  let n = 0;
  for (let b = 0; b < bi; b++) for (const c of VERSES[b]) n += c;
  for (let c = 0; c < chapter - 1; c++) n += VERSES[bi][c];
  return n + verse - 1;
}

let starts: Int32Array | null = null;

/** Inverse of verseOrdinal. */
export function verseAtOrdinal(ordinal: number): { bookIndex: number; chapter: number; verse: number } {
  if (!starts) {
    starts = new Int32Array(VERSES.flat().length + 1);
    let n = 0;
    let i = 0;
    for (const chapters of VERSES) for (const c of chapters) {
      starts[i++] = n;
      n += c;
    }
    starts[i] = n;
  }
  let lo = 0;
  let hi = starts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= ordinal) lo = mid;
    else hi = mid - 1;
  }
  let flat = lo;
  for (let b = 0; b < VERSES.length; b++) {
    if (flat < VERSES[b].length) return { bookIndex: b + 1, chapter: flat + 1, verse: ordinal - starts[lo] + 1 };
    flat -= VERSES[b].length;
  }
  throw new Error(`Ordinal out of range: ${ordinal}`);
}
