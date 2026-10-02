import type { BookCode } from '@/lib/bible/books';
import { fromCompact, type Ref, refContainsVerse } from '@/lib/bible/refs';
import { verseCount } from '@/lib/bible/versification';
import type { GospelCode, Harmony, HarmonySection } from '@/lib/data/types';

// Gospel harmony helpers (A. T. Robertson, 1922). A section's ref for one gospel may hold several
// passages separated by ";" ("MAT.21.1-11;MAT.21.14-17").

export const GOSPELS: GospelCode[] = ['MAT', 'MRK', 'LUK', 'JHN'];

export function isGospel(book: BookCode): book is GospelCode {
  return (GOSPELS as string[]).includes(book);
}

export function splitRefs(refs: string | undefined): Ref[] {
  if (!refs) return [];
  return refs
    .split(';')
    .map((s) => fromCompact(s.trim()))
    .filter((r): r is Ref => !!r);
}

export function allSections(h: Harmony): HarmonySection[] {
  return h.parts.flatMap((p) => p.sections);
}

/** Gospels that have an account in this section, in canonical order. */
export function gospelsOf(section: HarmonySection): GospelCode[] {
  return GOSPELS.filter((g) => section.refs[g]);
}

export function sectionsForVerse(h: Harmony, book: BookCode, chapter: number, verse: number): HarmonySection[] {
  if (!isGospel(book)) return [];
  return allSections(h).filter((s) => splitRefs(s.refs[book]).some((r) => refContainsVerse(r, book, chapter, verse)));
}

/** Every verse a passage covers, chapter by chapter (KJV versification). */
export function versesOf(ref: Ref): { chapter: number; verses: number[] }[] {
  const endCh = ref.endChapter ?? ref.chapter;
  const out: { chapter: number; verses: number[] }[] = [];
  for (let c = ref.chapter; c <= endCh; c++) {
    const last = verseCount(ref.book, c);
    const from = c === ref.chapter ? (ref.verse ?? 1) : 1;
    const to =
      c === endCh
        ? ref.verse === undefined
          ? last
          : (ref.endVerse ?? (ref.endChapter === undefined ? ref.verse : last))
        : last;
    const verses: number[] = [];
    for (let v = from; v <= Math.min(to, last); v++) verses.push(v);
    out.push({ chapter: c, verses });
  }
  return out;
}

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'");

/**
 * Parts and sections whose title or references match the typed text. `describe` turns a section's
 * refs into searchable text (e.g. "Luke 1:1–4"), so "luke 1" finds the sections from Luke 1.
 */
export function filterHarmony(h: Harmony, query: string, describe: (s: HarmonySection) => string): Harmony['parts'] {
  const q = normalize(query.trim());
  if (!q) return h.parts;
  const words = q.split(/\s+/);
  return h.parts
    .map((p) => ({
      title: p.title,
      sections: p.sections.filter((s) => {
        const hay = normalize(`${p.title} ${s.title} ${describe(s)}`);
        return words.every((w) => hay.includes(w));
      }),
    }))
    .filter((p) => p.sections.length);
}
