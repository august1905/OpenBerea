import type { BookCode } from '@/lib/bible/books';
import type { ConcEntry, LexiconEntry, MorphEntry, OrigChapter, StepLexEntry, StrongsEntry } from '@/lib/data/types';
import { loadData } from '@/lib/data/fetch';

// Paths and loaders for original-language data. Strong's ids: "G25", "H430" (base) or STEPBible's
// extended "G0025", "H0430G".

const STRONGS_RE = /^([GH])0*(\d+)([a-zA-Z]?)$/;

/** "G0025" → "G25", "H0430G" → "H430", "g25" → "G25". Null when not a Strong's id. */
export function baseStrongs(id: string): string | null {
  const m = STRONGS_RE.exec(id.trim().toUpperCase().replace(/^([GH])0*(\d+)[A-Z]$/, '$1$2'));
  if (!m) return null;
  return `${m[1]}${Number(m[2])}`;
}

export function strongsNumber(id: string): number {
  return Number(baseStrongs(id)?.slice(1) ?? 0);
}

export function languageOf(id: string): 'hbo' | 'grc' {
  return id.toUpperCase().startsWith('H') ? 'hbo' : 'grc';
}

const bucket = (id: string) => Math.floor(strongsNumber(id) / 100);
const letter = (id: string) => (languageOf(id) === 'hbo' ? 'H' : 'G');

export const paths = {
  orig: (book: BookCode, chapter: number) => `stepbible/orig/${book}/${chapter}.json`,
  strongs: (id: string) => `strongs/${letter(id)}/${bucket(id)}.json`,
  step: (id: string) => `stepbible/lex/${letter(id)}/${bucket(id)}.json`,
  conc: (id: string) => `stepbible/conc/${letter(id)}/${bucket(id)}.json`,
  thayer: (id: string) => `thayer/G/${bucket(id)}.json`,
  bdb: (id: string) => `bdb/H/${bucket(id)}.json`,
  gesenius: (id: string) => `gesenius/H/${bucket(id)}.json`,
  morph: (lang: 'hbo' | 'grc') => `stepbible/morph/${lang}.json`,
};

export async function loadStrongs(id: string): Promise<StrongsEntry | null> {
  const base = baseStrongs(id);
  if (!base) return null;
  const shard = await loadData<Record<string, StrongsEntry>>(paths.strongs(base)).catch(() => null);
  return shard?.[base] ?? null;
}

/** All STEPBible brief-lexicon entries for a base number (a number can have several senses). */
export async function loadStepEntries(id: string, extended?: string): Promise<StepLexEntry[]> {
  const base = baseStrongs(id);
  if (!base) return [];
  const shard = await loadData<Record<string, StepLexEntry>>(paths.step(base)).catch(() => null);
  if (!shard) return [];
  const all = Object.values(shard).filter((e) => e.base === base);
  if (extended && shard[extended]) return [shard[extended], ...all.filter((e) => e.id !== extended)];
  return all;
}

export async function loadConcordance(id: string): Promise<ConcEntry | null> {
  const base = baseStrongs(id);
  if (!base) return null;
  const shard = await loadData<Record<string, ConcEntry>>(paths.conc(base)).catch(() => null);
  return shard?.[base] ?? null;
}

export async function loadLexicon(kind: 'thayer' | 'bdb' | 'gesenius', id: string): Promise<LexiconEntry | null> {
  const base = baseStrongs(id);
  if (!base) return null;
  const shard = await loadData<Record<string, LexiconEntry>>(paths[kind](base)).catch(() => null);
  return shard?.[base] ?? null;
}

export function loadMorphTable(lang: 'hbo' | 'grc') {
  return loadData<Record<string, MorphEntry>>(paths.morph(lang));
}

export function loadOrig(book: BookCode, chapter: number) {
  return loadData<OrigChapter>(paths.orig(book, chapter));
}
