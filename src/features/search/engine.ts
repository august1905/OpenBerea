import type { LexIndex } from '@/lib/data/types';

// In-browser search over prebuilt indexes: the verse corpora (search/kjv.json, search/asv.json) and
// the Strong's lexicon index (strongs/index.json). No search server.

export type SearchMode = 'words' | 'phrase' | 'strongs' | 'original';

const ORIGINAL_SCRIPT = /[֐-׿יִ-ﭏͰ-Ͽἀ-῿]/;
const STRONGS = /^\s*[GHgh]\d{1,4}[a-zA-Z]?\s*$/;

/** Guesses the mode from the query: Strong's number, Hebrew/Greek script, quoted phrase, or words. */
export function detectMode(q: string): SearchMode {
  if (STRONGS.test(q)) return 'strongs';
  if (ORIGINAL_SCRIPT.test(q)) return 'original';
  if (/^\s*".+"\s*$/.test(q)) return 'phrase';
  return 'words';
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A term as a whole-word pattern; a trailing * matches word beginnings ("lov*" → love, loveth). */
function termPattern(term: string): string {
  const wild = term.endsWith('*');
  const core = escape(term.replace(/\*+$/, '').replace(/[’']/g, "'")).replace(/'/g, "['’]");
  return `(?<![\\p{L}\\p{N}])${core}${wild ? "[\\p{L}'’]*" : '(?![\\p{L}\\p{N}])'}`;
}

export interface CompiledQuery {
  mode: 'words' | 'phrase';
  /** All must match (words), or the single phrase pattern. */
  tests: RegExp[];
  /** Marks every matched term for highlighting. */
  highlight: RegExp;
  terms: string[];
}

export function compileQuery(q: string, mode: 'words' | 'phrase'): CompiledQuery | null {
  const clean = q.trim().replace(/^"|"$/g, '').trim();
  if (!clean) return null;
  if (mode === 'phrase') {
    const words = clean.split(/\s+/).map(termPattern);
    const pattern = words.join('[\\s\\p{P}]+');
    return { mode, tests: [new RegExp(pattern, 'iu')], highlight: new RegExp(pattern, 'giu'), terms: [clean] };
  }
  const terms = clean
    .replace(/"/g, '')
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}*]+|[^\p{L}\p{N}*]+$/gu, ''))
    .filter(Boolean);
  if (!terms.length) return null;
  const patterns = terms.map(termPattern);
  return {
    mode,
    tests: patterns.map((p) => new RegExp(p, 'iu')),
    highlight: new RegExp(patterns.join('|'), 'giu'),
    terms,
  };
}

/** Ordinals (canonical verse positions) of verses matching every test. */
export function searchCorpus(corpus: string[], query: CompiledQuery): number[] {
  const out: number[] = [];
  const [first, ...rest] = query.tests;
  for (let i = 0; i < corpus.length; i++) {
    const text = corpus[i];
    if (!text || !first.test(text)) continue;
    if (rest.every((r) => r.test(text))) out.push(i);
  }
  return out;
}

/** Splits text into plain and matched runs for highlighting. */
export function highlightRuns(text: string, highlight: RegExp): { t: string; hit: boolean }[] {
  const out: { t: string; hit: boolean }[] = [];
  let last = 0;
  highlight.lastIndex = 0;
  for (const m of text.matchAll(highlight)) {
    if (!m[0]) continue;
    if (m.index! > last) out.push({ t: text.slice(last, m.index), hit: false });
    out.push({ t: m[0], hit: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), hit: false });
  return out;
}

/** Removes accents, breathings, vowel points, and cantillation for original-language matching. */
export function foldOriginal(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇ׳״]/g, '')
    .replace(/ς/g, 'σ')
    .toLowerCase()
    .trim();
}

/** Folds transliterations: "agapē", "a.ga.Pe", "agape" all compare equal. */
export function foldTranslit(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
}

/**
 * Original-language word search over the lexicon index: Hebrew or Greek lemma (accent-insensitive),
 * or a transliteration. Exact matches first, then prefixes, then substrings.
 */
export function searchLexicon(index: LexIndex, q: string, limit = 60): LexIndex {
  const original = ORIGINAL_SCRIPT.test(q);
  const needle = original ? foldOriginal(q) : foldTranslit(q);
  if (!needle) return [];
  const scored: [number, LexIndex[number]][] = [];
  for (const row of index) {
    const hay = original ? foldOriginal(row[1]) : foldTranslit(row[2]);
    let score = -1;
    if (hay === needle) score = 0;
    else if (hay.startsWith(needle)) score = 1;
    else if (needle.length >= 3 && hay.includes(needle)) score = 2;
    if (score >= 0) scored.push([score * 100000 + Number(row[0].slice(1)), row]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, r]) => r);
}

export function normalizeStrongsQuery(q: string): string {
  const m = /^\s*([GHgh])0*(\d+)/.exec(q);
  return m ? `${m[1].toUpperCase()}${Number(m[2])}` : q.trim();
}
