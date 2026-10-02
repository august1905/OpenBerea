import type { BookCode } from '@/lib/bible/books';
import { fromCompact, type Ref, refContainsVerse, toCompact } from '@/lib/bible/refs';
import type { ChapterText, Seg, TranslationId } from '@/lib/data/types';

import type { Span } from './chunks';
import { tokenize, type Word } from './tokenize';

// The passage being practiced: its verses as words, and the practice units cut from it.

export interface PracticeWord extends Word {
  /** Position of the word's verse within the unit. */
  vi: number;
  /** First word of its verse (a verse number is shown before it). */
  verseStart?: true;
  /** Printed in small capitals (LORD). */
  sc?: true;
}

export interface PassageVerse {
  c: number;
  n: number;
  text: string;
  words: PracticeWord[];
}

export interface Passage {
  ref: Ref;
  tr: TranslationId;
  verses: PassageVerse[];
}

/** Character ranges of segments printed in small capitals (the divine name, LORD). */
function smallCapsRanges(segs: Seg[]): [number, number][] {
  const out: [number, number][] = [];
  let at = 0;
  for (const s of segs) {
    const text = typeof s === 'string' ? s : s.t;
    if (typeof s !== 'string' && s.dn) out.push([at, at + text.length]);
    at += text.length;
  }
  return out;
}

/**
 * Builds the passage from loaded chapters, keeping only the verses the ref covers. `textOf` turns
 * segments into plain text (the reader's segsText).
 */
export function buildPassage(chapters: readonly ChapterText[], ref: Ref, tr: TranslationId, textOf: (segs: Seg[]) => string): Passage {
  const verses: PassageVerse[] = [];
  for (const ch of chapters) {
    for (const v of ch.v) {
      if (!refContainsVerse(ref, ref.book, ch.c, v.n)) continue;
      const raw = textOf(v.s);
      const caps = smallCapsRanges(v.s);
      const words: PracticeWord[] = tokenize(raw).map((w) => {
        const sc = caps.some(([a, b]) => w.at < b && w.at + w.text.length > a);
        return sc ? { ...w, vi: 0, sc: true } : { ...w, vi: 0 };
      });
      verses.push({ c: ch.c, n: v.n, text: raw.trim(), words });
    }
  }
  return { ref, tr, verses };
}

/** Chapters a ref spans, in order. */
export function chaptersOf(ref: Ref): number[] {
  const end = ref.endChapter ?? ref.chapter;
  return Array.from({ length: end - ref.chapter + 1 }, (_, i) => ref.chapter + i);
}

/** A practice unit: some consecutive verses of the passage, with words numbered from 0. */
export interface Unit {
  ref: Ref;
  verses: PassageVerse[];
  words: PracticeWord[];
}

export function unitOf(book: BookCode, verses: readonly PassageVerse[], span?: Span): Unit {
  const picked = span ? verses.slice(span.start, span.end + 1) : [...verses];
  const words: PracticeWord[] = [];
  const out: PassageVerse[] = picked.map((v, vi) => {
    const ws = v.words.map((w, k) => {
      const word: PracticeWord = { ...w, i: words.length + k, vi };
      if (k === 0) word.verseStart = true;
      return word;
    });
    words.push(...ws);
    return { ...v, words: ws };
  });
  const first = out[0];
  const last = out[out.length - 1];
  const ref: Ref = first ? { book, chapter: first.c, verse: first.n } : { book, chapter: 1 };
  if (first && last && last !== first) {
    if (last.c !== first.c) ref.endChapter = last.c;
    ref.endVerse = last.n;
  }
  return { ref, verses: out, words };
}

/** Compact ref of a unit, e.g. "PSA.23.1-3". */
export function unitKey(unit: Unit): string {
  return toCompact(unit.ref);
}

/** Validates a compact ref from the URL against the versification. */
export function parseCompactRef(value: string | undefined | null, verseCount: (b: BookCode, c: number) => number): Ref | null {
  if (!value) return null;
  const ref = fromCompact(value.toUpperCase());
  if (!ref) return null;
  const chapters = verseCount(ref.book, ref.chapter);
  if (!chapters) return null;
  if (ref.verse !== undefined && (ref.verse < 1 || ref.verse > chapters)) return null;
  const endCh = ref.endChapter ?? ref.chapter;
  if (endCh < ref.chapter || !verseCount(ref.book, endCh)) return null;
  if (ref.endVerse !== undefined) {
    if (ref.endVerse > verseCount(ref.book, endCh)) return null;
    if (endCh === ref.chapter && ref.verse !== undefined && ref.endVerse < ref.verse) return null;
  }
  return ref;
}
