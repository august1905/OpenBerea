import type { OrigVerse, VariantChapter, VariantUnit } from '@/lib/data/types';

// Pure helpers for textual variants (STEPBible TAGNT edition markers).

/** The eight printed Greek editions STEPBible compares, in its order. */
export const MAIN_EDITIONS = ['NA28', 'NA27', 'Tyn', 'SBL', 'WH', 'Treg', 'TR', 'Byz'] as const;
export type MainEdition = (typeof MAIN_EDITIONS)[number];

export interface EditionToken {
  code: string;
  /** One of the eight main editions (explained in the legend). */
  main: boolean;
}

/** "Treg+TR+Byz" → tokens; word-order suffixes ("TR»1") and blanks are dropped, duplicates kept once. */
export function parseEditions(ed: string): EditionToken[] {
  const seen = new Set<string>();
  const out: EditionToken[] = [];
  for (const raw of ed.split('+')) {
    const code = raw.replace(/[»«].*$/, '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, main: (MAIN_EDITIONS as readonly string[]).includes(code) });
  }
  return out;
}

/** Editions for display: "Treg+TR+Byz" → "Treg, TR, Byz". */
export function formatEditions(ed: string): string {
  return parseEditions(ed)
    .map((t) => t.code)
    .join(', ');
}

/** Legend rows for a chapter: the main editions, plus whether any other label appears. */
export function editionLegend(chapter: VariantChapter | undefined): { main: MainEdition[]; other: string[] } {
  const other = new Set<string>();
  for (const units of Object.values(chapter?.v ?? {})) {
    for (const u of units) for (const t of parseEditions(u.ed)) if (!t.main) other.add(t.code);
  }
  return { main: [...MAIN_EDITIONS], other: [...other].sort() };
}

export interface WordVariants {
  /** Index of the word in the verse's word list. */
  w: number;
  /** The word as printed in the verse (from the original text), when known. */
  word?: string;
  gloss?: string;
  presence?: VariantUnit;
  alts: VariantUnit[];
}

/** Groups a verse's units by word, in word order, with the word's text from the original. */
export function groupUnits(units: VariantUnit[], verse?: OrigVerse): WordVariants[] {
  const byWord = new Map<number, WordVariants>();
  for (const u of units) {
    let g = byWord.get(u.w);
    if (!g) {
      const w = verse?.w[u.w];
      g = { w: u.w, word: w?.t, gloss: w?.g, alts: [] };
      byWord.set(u.w, g);
    }
    if (u.k === 'presence') g.presence = u;
    else g.alts.push(u);
  }
  return [...byWord.values()].sort((a, b) => a.w - b.w);
}

/** Verse numbers with variants, ascending. */
export function variantVerses(chapter: VariantChapter | undefined): number[] {
  return Object.keys(chapter?.v ?? {})
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
}

/** Strips trailing punctuation from a Greek word ("κόσμον," → "κόσμον") for labels. */
export function bareWord(t: string): string {
  return t.replace(/[\s,.;:·;·"“”()[\]]+$/u, '');
}
