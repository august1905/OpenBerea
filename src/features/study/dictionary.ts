import type { DictIndex, DictionaryId } from '@/lib/data/types';

// Pure helpers for the Bible dictionaries and Nave's topical index: headword folding, search,
// A–Z grouping, and neighbors.

/** The three dictionaries, in display order. Nave's is the topical index (its own screens). */
export const DICTIONARIES = ['easton', 'smith', 'isbe'] as const satisfies readonly DictionaryId[];
export type BibleDictionary = (typeof DICTIONARIES)[number];

export function toDictionaryId(value: string | undefined): DictionaryId | null {
  return value === 'easton' || value === 'smith' || value === 'isbe' || value === 'nave' ? value : null;
}

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Folds a headword or query for matching: case- and accent-insensitive, curly quotes and dashes
 * straightened, runs of spaces collapsed. "Ésaü’s" → "esau's".
 */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** A–Z letter an entry is filed under ("#" for anything else). */
export function letterOf(title: string): string {
  const c = fold(title).replace(/^[^a-z0-9]+/, '').charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

/** Entries filed under a letter, in index order. */
export function entriesForLetter(index: DictIndex, letter: string): DictIndex {
  return index.filter((e) => letterOf(e[1]) === letter);
}

/** Letters that have at least one entry. */
export function lettersWithEntries(index: DictIndex): Set<string> {
  return new Set(index.map((e) => letterOf(e[1])));
}

/** Ranks a folded headword against a folded query: 0 exact, 1 prefix, 2 word prefix, 3 contains. */
function rank(title: string, q: string): number {
  if (title === q) return 0;
  if (title.startsWith(q)) return 1;
  if (title.includes(` ${q}`) || title.includes(`-${q}`) || title.includes(`(${q}`)) return 2;
  if (title.includes(q)) return 3;
  return -1;
}

// Folded titles per index, computed once (indexes hold thousands of headwords).
const foldedTitles = new WeakMap<DictIndex, string[]>();

function folded(index: DictIndex): string[] {
  let titles = foldedTitles.get(index);
  if (!titles) {
    titles = index.map((e) => fold(e[1]));
    foldedTitles.set(index, titles);
  }
  return titles;
}

/** Matching entries of one index, best first (exact, prefix, word prefix, contains; then index order). */
export function searchIndex(index: DictIndex, query: string): DictIndex {
  const q = fold(query);
  if (!q) return [];
  const titles = folded(index);
  const hits: { e: DictIndex[number]; r: number; i: number }[] = [];
  index.forEach((e, i) => {
    const r = rank(titles[i], q);
    if (r >= 0) hits.push({ e, r, i });
  });
  hits.sort((a, b) => a.r - b.r || a.i - b.i);
  return hits.map((h) => h.e);
}

export interface SearchGroup<D extends string = DictionaryId> {
  dict: D;
  entries: DictIndex;
}

/** Searches several dictionaries; groups follow the given order and empty groups are dropped. */
export function searchAll<D extends string>(indexes: Partial<Record<D, DictIndex>>, order: readonly D[], query: string): SearchGroup<D>[] {
  return order
    .map((dict) => ({ dict, entries: indexes[dict] ? searchIndex(indexes[dict]!, query) : [] }))
    .filter((g) => g.entries.length > 0);
}

/** The entries before and after `id` in index order. */
export function neighbors(index: DictIndex, id: string): { prev?: DictIndex[number]; next?: DictIndex[number] } {
  const i = index.findIndex((e) => e[0] === id);
  if (i < 0) return {};
  return { prev: index[i - 1], next: index[i + 1] };
}

/** Finds an index row by id, falling back to a case-insensitive match. */
export function findEntry(index: DictIndex, id: string): DictIndex[number] | undefined {
  const exact = index.find((e) => e[0] === id);
  if (exact) return exact;
  const lower = id.toLowerCase();
  return index.find((e) => e[0].toLowerCase() === lower);
}
