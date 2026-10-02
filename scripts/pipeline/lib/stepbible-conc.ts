// Concordance: occurrences of each Strong's number in the original-language text (from the orig
// output) and how the KJV renders it (from the kjv output's Strong's-tagged segments).
import { verseId } from '../../../src/lib/bible/refs';
import type { ChapterText, ConcEntry, OrigChapter, Seg } from '../../../src/lib/data/types';
import { wordStrongs } from './stepbible-text';

/** Lower case, outer punctuation trimmed, inner whitespace collapsed: "God," → "god". */
export function normalizeRendering(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();
}

/** Strong's number → rendering → count. */
export type RenderingCounts = Map<string, Map<string, number>>;

/**
 * Counts how the KJV renders each Strong's number. Every segment with `s` contributes its text
 * (normalized) to each of its Strong's numbers; identical renderings are merged. Psalm titles count.
 * Pass `into` to accumulate across calls (book by book).
 */
export function countRenderings(chapters: ChapterText[], into: RenderingCounts = new Map()): RenderingCounts {
  const visit = (segs: Seg[] | undefined) => {
    if (!segs) return;
    for (const seg of segs) {
      if (typeof seg === 'string' || !seg.s?.length) continue;
      const r = normalizeRendering(seg.t);
      if (!r) continue;
      for (const s of seg.s) {
        let m = into.get(s);
        if (!m) into.set(s, (m = new Map()));
        m.set(r, (m.get(r) ?? 0) + 1);
      }
    }
  };
  for (const ch of chapters) {
    visit(ch.title);
    for (const v of ch.v) visit(v.s);
  }
  return into;
}

/** Most frequent first; ties alphabetical. */
export function sortRenderings(counts: Map<string, number> | undefined): [string, number][] {
  if (!counts) return [];
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export interface Occurrences {
  n: number;
  verses: Set<number>;
}

/**
 * Adds the occurrences in one orig chapter to `into`. Hebrew words count their root and every
 * non-affix morpheme (H9xxx prefixes/suffixes are skipped); Greek words count their main Strong's.
 * Psalm titles are verse 0 (verse id …000). Returns the number of Hebrew words that contributed
 * nothing because they consist only of affixes.
 */
export function countOccurrences(chapter: OrigChapter, into: Map<string, Occurrences>): number {
  let affixOnly = 0;
  for (const verse of chapter.v) {
    const id = verseId(chapter.b, chapter.c, verse.n);
    for (const word of verse.w) {
      const strongs = chapter.lang === 'hbo' ? wordStrongs(word) : [word.s];
      if (!strongs.length) affixOnly++;
      for (const s of strongs) {
        let o = into.get(s);
        if (!o) into.set(s, (o = { n: 0, verses: new Set() }));
        o.n++;
        o.verses.add(id);
      }
    }
  }
  return affixOnly;
}

export function concEntry(occ: Occurrences, kjv: Map<string, number> | undefined): ConcEntry {
  return { n: occ.n, v: [...occ.verses].sort((a, b) => a - b), kjv: sortRenderings(kjv) };
}
