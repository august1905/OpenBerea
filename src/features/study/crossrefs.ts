import type { BookCode } from '@/lib/bible/books';
import { fromCompact } from '@/lib/bible/refs';
import type { ChapterText, OpenBibleXrefChapter, TskChapter } from '@/lib/data/types';

// Pure helpers for cross-references (Treasury of Scripture Knowledge and OpenBible.info).

/** OpenBible.info refs shown before "Show all". */
export const OPENBIBLE_TOP = 10;
/** KJV chapters loaded at once for previews. */
export const PREVIEW_BATCH = 6;
/** Longest preview, in characters. */
export const PREVIEW_MAX = 160;

export interface VerseXrefs {
  tsk: string[];
  /** [compact ref, votes], most votes first. */
  openbible: [string, number][];
}

export function verseXrefs(tsk: TskChapter | undefined, ob: OpenBibleXrefChapter | undefined, verse: number): VerseXrefs {
  const key = String(verse);
  return { tsk: tsk?.[key] ?? [], openbible: ob?.[key] ?? [] };
}

/** Verse numbers that have any cross-reference, ascending. */
export function versesWithXrefs(tsk: TskChapter | undefined, ob: OpenBibleXrefChapter | undefined): number[] {
  const set = new Set<number>();
  for (const k of [...Object.keys(tsk ?? {}), ...Object.keys(ob ?? {})]) {
    const n = Number(k);
    if (Number.isInteger(n) && n > 0) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/** Chapter key "ROM.5" for a compact ref, or null when it can't be read. */
export function chapterKey(compact: string): string | null {
  const ref = fromCompact(compact);
  return ref ? `${ref.book}.${ref.chapter}` : null;
}

/** Unique chapters needed to preview the refs, in first-use order. */
export function previewChapters(refs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of refs) {
    const key = chapterKey(r);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

export function chapterPath(key: string): string {
  const [book, ch] = key.split('.');
  return `kjv/${book as BookCode}/${ch}.json`;
}

/** Splits a list into consecutive groups of at most `size`. */
export function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Shortens text at a word boundary, adding an ellipsis. */
export function truncate(text: string, max = PREVIEW_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

const plain = (segs: ChapterText['v'][number]['s']) => segs.map((s) => (typeof s === 'string' ? s : s.t)).join('');

/**
 * Plain KJV text of a ref from its (first) chapter: the verse, or the verses of a range within that
 * chapter; a chapter ref previews its first verse. Null when the chapter or verse is missing.
 */
export function previewText(compact: string, chapter: ChapterText | undefined, max = PREVIEW_MAX): string | null {
  const ref = fromCompact(compact);
  if (!ref || !chapter) return null;
  const start = ref.verse ?? 1;
  const end = ref.endChapter !== undefined ? Infinity : (ref.endVerse ?? start);
  const parts: string[] = [];
  let length = 0;
  for (const v of chapter.v) {
    if (v.n < start || v.n > end) continue;
    const text = plain(v.s);
    parts.push(text);
    length += text.length;
    if (length > max) break;
  }
  return parts.length ? truncate(parts.join(' '), max) : null;
}
