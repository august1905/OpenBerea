// OSIS references (osisRef attributes of CrossWire modules) → the app's compact refs, checked
// against the KJV versification: "Rom.5.8" → "ROM.5.8", "Rom.5.8-Rom.5.10" → "ROM.5.8-10",
// "Gen.1.1-Gen.2.3" → "GEN.1.1-2.3", "Ps.23" → "PSA.23".
import { type BookCode, bookInfo } from '../../../src/lib/bible/books';
import { fromCompact, parseBookName, type Ref, toCompact } from '../../../src/lib/bible/refs';
import { verseCount } from '../../../src/lib/bible/versification';
import { osisToBook } from './osis-books';

export type RefResult = { ref: string; note?: string } | { error: string };

interface Point {
  book: BookCode;
  chapter?: number;
  verse?: number;
}

function parsePoint(s: string, context?: Point): Point | string {
  const full = /^([1-3]?[A-Za-z]+)(?:\.(\d+)(?:\.(\d+))?)?$/.exec(s);
  if (full) {
    // A few commentary refs use common abbreviations instead of OSIS ids ("Ge.17.20").
    const book = osisToBook(full[1]) ?? parseBookName(full[1]);
    if (!book) return `unknown book "${full[1]}"`;
    return { book, chapter: full[2] ? Number(full[2]) : undefined, verse: full[3] ? Number(full[3]) : undefined };
  }
  // Abbreviated range ends: "Rom.5.8-10" or "Gen.1.1-2.3".
  const short = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (short && context?.chapter !== undefined) {
    if (short[2]) return { book: context.book, chapter: Number(short[1]), verse: Number(short[2]) };
    return context.verse !== undefined
      ? { book: context.book, chapter: context.chapter, verse: Number(short[1]) }
      : { book: context.book, chapter: Number(short[1]) };
  }
  return `cannot parse "${s}"`;
}

function checkPoint(p: Point, label: string): string | null {
  if (p.chapter === undefined) return `${label} has no chapter`;
  if (p.chapter < 1 || p.chapter > bookInfo(p.book).chapters) return `${label} chapter ${p.chapter} not in ${p.book}`;
  if (p.verse !== undefined && (p.verse < 1 || p.verse > verseCount(p.book, p.chapter))) {
    return `${label} verse ${p.book} ${p.chapter}:${p.verse} not in the KJV versification`;
  }
  return null;
}

/**
 * Converts one osisRef value to a compact ref. A "Bible:" work prefix and grain ("!a") are
 * ignored. Chapter ranges ("Ps.1-Ps.2") become their first chapter (noted). Anything else that
 * the compact form cannot express, or that is outside the KJV versification, is an error.
 */
export function osisRefToCompact(osisRef: string): RefResult {
  let s = osisRef.trim();
  const work = /^([\w.]+):(.*)$/.exec(s);
  if (work) {
    if (!/^Bible\b/i.test(work[1])) return { error: `not a Bible reference (${work[1]}:)` };
    s = work[2];
  }
  s = s.replace(/![\w.]*/g, '');
  if (!s || /\s/.test(s)) return { error: `cannot parse "${osisRef}"` };
  const [a, b, extra] = s.split('-');
  if (extra !== undefined) return { error: `cannot parse "${osisRef}"` };
  const start = parsePoint(a);
  if (typeof start === 'string') return { error: start };
  const bad = checkPoint(start, 'start');
  if (bad) return { error: bad };
  const ref: Ref = { book: start.book, chapter: start.chapter!, verse: start.verse };
  if (ref.verse === undefined) delete ref.verse;
  if (b === undefined) return { ref: toCompact(ref) };

  const end = parsePoint(b, start);
  if (typeof end === 'string') return { error: end };
  if (end.book !== start.book) return { error: `cross-book range "${osisRef}"` };
  const badEnd = checkPoint(end, 'end');
  if (badEnd) return { error: badEnd };
  if (start.verse === undefined) {
    if (end.verse !== undefined) return { error: `chapter-to-verse range "${osisRef}"` };
    if (end.chapter! < start.chapter!) return { error: `backwards range "${osisRef}"` };
    return end.chapter === start.chapter ? { ref: toCompact(ref) } : { ref: toCompact(ref), note: 'chapter range shortened to its first chapter' };
  }
  // "Gen.1.1-Gen.2" runs to the end of chapter 2.
  const endVerse = end.verse ?? verseCount(end.book, end.chapter!);
  if (end.chapter! < start.chapter! || (end.chapter === start.chapter && endVerse < start.verse!)) {
    return { error: `backwards range "${osisRef}"` };
  }
  if (end.chapter === start.chapter) {
    if (endVerse !== start.verse) ref.endVerse = endVerse;
  } else {
    ref.endChapter = end.chapter;
    ref.endVerse = endVerse;
  }
  return { ref: toCompact(ref) };
}

/** True when a compact ref names verses that exist in the KJV versification. */
export function compactValid(s: string): boolean {
  const r = fromCompact(s);
  if (!r || r.chapter < 1 || r.chapter > bookInfo(r.book).chapters) return false;
  if (r.verse === undefined) return r.endVerse === undefined;
  if (r.verse < 1 || r.verse > verseCount(r.book, r.chapter)) return false;
  const endCh = r.endChapter ?? r.chapter;
  if (endCh < r.chapter || endCh > bookInfo(r.book).chapters) return false;
  if (r.endVerse !== undefined) {
    if (r.endVerse < 1 || r.endVerse > verseCount(r.book, endCh)) return false;
    if (endCh === r.chapter && r.endVerse <= r.verse) return false;
  }
  if (r.endChapter !== undefined && r.endChapter <= r.chapter) return false;
  return true;
}
