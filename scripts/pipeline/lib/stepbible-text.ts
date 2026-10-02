// Parsing and conversion of the STEPBible tagged texts: TAHOT (Hebrew OT) and TAGNT (Greek NT).
// Rows become OrigWord objects grouped by KJV verse; TAGNT rows also yield textual-variant units.
import type { BookCode } from '../../../src/lib/bible/books';
import type { OrigChapter, OrigMorpheme, OrigVerse, OrigWord, VariantUnit } from '../../../src/lib/data/types';
import { ALL_EDITIONS, baseStrong, editionTokens, formatSourceRefs, stepBook } from './stepbible-common';

/** Resolves a source dStrong ("H0430J") to an id that exists in the brief lexicon, or null. */
export type ExtResolver = (dStrong: string) => string | null;
/** Resolves a STEPBible proper-name id (with the word's dStrongs) to a TIPNR record id, or null. */
export type NameResolver = (raw: string, dStrongs: string[]) => string | null;

// ---------------------------------------------------------------------------------------------
// TAHOT

const TAHOT_ROW = /^([1-3A-Z][a-z0-9A-Z]{2})\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#(\d+)=([^\t]*)\t/;

export interface TahotRow {
  book: BookCode;
  /** English (KJV) chapter and verse. */
  ch: number;
  vs: number;
  /** Hebrew chapter and verse (same as English when the source gives no bracket). */
  hch: number;
  hvs: number;
  /** Word number within the Hebrew verse, as in the source ("01", "0501"). */
  wn: string;
  /** Text type: L, Q(K), R, X, … */
  type: string;
  heb: string;
  translit: string;
  gloss: string;
  dStrongs: string;
  grammar: string;
  expanded: string;
}

export function parseTahotRow(line: string): TahotRow | null {
  const m = TAHOT_ROW.exec(line);
  if (!m) return null;
  const book = stepBook(m[1]);
  if (!book) throw new Error(`TAHOT: unknown book in ${line.slice(0, 40)}`);
  const f = line.split('\t');
  const ch = Number(m[2]);
  const vs = Number(m[3]);
  return {
    book,
    ch,
    vs,
    hch: m[4] ? Number(m[4]) : ch,
    hvs: m[5] ? Number(m[5]) : vs,
    wn: m[6],
    type: m[7],
    heb: f[1] ?? '',
    translit: f[2] ?? '',
    gloss: f[3] ?? '',
    dStrongs: f[4] ?? '',
    grammar: f[5] ?? '',
    expanded: f[11] ?? '',
  };
}

const PUNCT_TAIL = /^(\\[\s׃׀־׆]*[ספ]?)+$/u;

/**
 * Removes the punctuation part of a Hebrew morpheme ("אָֽרֶץ\׃" → "אָֽרֶץ"). A backslash followed by
 * more letters (the one-word "Kedor\־laomer") only loses the backslash.
 */
export function stripHebrewPunct(seg: string): string {
  const i = seg.indexOf('\\');
  if (i < 0) return seg;
  if (PUNCT_TAIL.test(seg.slice(i))) return seg.slice(0, i);
  return seg.replace(/\\/g, '');
}

/**
 * Surface text of a Hebrew word: morpheme separators removed, punctuation kept attached. Maqqef and
 * sof pasuq join directly ("כִּֽי־", "הָאָֽרֶץ׃"); paseq and the paragraph letters stand after a space
 * ("אֱלֹהִ֤ים ׀", "׃ ס"); "//" (two words joined in one row) becomes a space.
 */
export function hebrewSurface(heb: string): string {
  return heb
    .replace(/\/\//g, ' ')
    .replace(/\\׀/g, ' ׀')
    .replace(/[/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Removes punctuation tags and the "+" continuation mark from a dStrong part: "{H0776G}\\H9016" → "{H0776G}". */
export function stripTagPunct(seg: string): string {
  return seg.replace(/\\.*$/, '').replace(/\+$/, '').trim();
}

/** Strong's/punctuation tags that join parts of a row rather than being morphemes. */
function isJoiner(tag: string): boolean {
  const t = tag.trim();
  return t === '' || /^H90(1[4-9])$/.test(t);
}

export interface TahotWordStats {
  /** Rows whose grammar segment is empty exactly where the dStrong segment is a joiner. */
  misaligned: number;
}

/**
 * Converts one TAHOT row to an OrigWord. Returns null for the 14 rows with no Hebrew (a Ketiv that
 * is written but not read: the Qere omits the word).
 */
export function tahotWord(
  row: TahotRow,
  resolveExt: ExtResolver,
  resolveName: NameResolver,
  stats?: TahotWordStats,
): OrigWord | null {
  if (!row.heb.trim()) return null;
  const hebSegs = row.heb.split('/');
  const tagSegs = row.dStrongs.split('/').map(stripTagPunct);
  const gramSegs = row.grammar.slice(1).split('/');
  const glossSegs = row.gloss.split('/');
  const lang = row.grammar[0] ?? 'H';
  if (hebSegs.length !== tagSegs.length || tagSegs.length !== gramSegs.length) {
    throw new Error(
      `TAHOT ${row.book}.${row.ch}.${row.vs}#${row.wn}: ${hebSegs.length} Hebrew / ${tagSegs.length} tag / ${gramSegs.length} grammar parts`,
    );
  }

  const parts: OrigMorpheme[] = [];
  const roots: string[] = [];
  for (let i = 0; i < tagSegs.length; i++) {
    const tag = tagSegs[i];
    if (isJoiner(tag)) {
      if (gramSegs[i].trim() && stats) stats.misaligned++;
      continue;
    }
    const isRoot = tag.startsWith('{');
    const dStrong = tag.replace(/[{}]/g, '');
    const s = baseStrong(dStrong);
    if (!s) throw new Error(`TAHOT ${row.book}.${row.ch}.${row.vs}#${row.wn}: bad tag "${tag}"`);
    if (isRoot) roots.push(dStrong);
    const part: OrigMorpheme = { t: stripHebrewPunct(hebSegs[i]), s };
    const gram = gramSegs[i].trim();
    if (gram) part.m = lang + gram;
    else if (stats) stats.misaligned++;
    const g = (glossSegs[i] ?? '').trim();
    if (g) part.g = g;
    parts.push(part);
  }
  if (!roots.length) throw new Error(`TAHOT ${row.book}.${row.ch}.${row.vs}#${row.wn}: no root in "${row.dStrongs}"`);

  const word: OrigWord = {
    t: hebrewSurface(row.heb),
    x: row.translit.replace(/\.?\/\//g, ' ').replace(/\//g, '').trim(),
    g: glossSegs
      .map((g) => g.trim())
      .filter((g) => g && !/^-+$/.test(g))
      .join(' '),
    s: baseStrong(roots[0])!,
    m: row.grammar,
  };
  const e = resolveExt(roots[0]);
  if (e) word.e = e;
  if (parts.length > 1) word.p = parts;
  const name = tahotName(row.expanded);
  if (name) {
    const pn = resolveName(name.raw, [name.dStrong, ...roots]);
    if (pn) word.pn = pn;
  }
  return word;
}

/** The proper-name id in TAHOT's expanded tags: "{H0430G=אֱלֹהִים=God»LORD@Gen.1.1-Heb}". */
export function tahotName(expanded: string): { raw: string; dStrong: string } | null {
  const m = /(H\d{4}[A-Za-z]?)=[^»{}]*»([^{}/\\]*@[^{}/\\]*)/.exec(expanded);
  return m ? { dStrong: m[1], raw: m[2].trim() } : null;
}

// ---------------------------------------------------------------------------------------------
// TAGNT

const TAGNT_ROW = /^([1-3A-Z][a-z0-9A-Z]{2})\.(\d+)\.(\d+)([^#\t]*)#(\d+)=([^\t]*)\t/;

export interface TagntRow {
  book: BookCode;
  /** TAGNT's own (NRSV-based) chapter and verse. */
  ch: number;
  vs: number;
  /** KJV chapter and verse: the "[ch.vs]" alternate when present. */
  kch: number;
  kvs: number;
  /** NA chapter and verse: the "(ch.vs)" alternate when present. */
  nch: number;
  nvs: number;
  wn: string;
  type: string;
  greek: string;
  english: string;
  /** "G0025=V-AAI-3S", crasis "G1473=P-1NS + G2532=CONJ". */
  tags: string;
  editions: string;
  meaningVariants: string;
  subMeaning: string;
}

export function parseTagntRow(line: string): TagntRow | null {
  const m = TAGNT_ROW.exec(line);
  if (!m) return null;
  const book = stepBook(m[1]);
  if (!book) throw new Error(`TAGNT: unknown book in ${line.slice(0, 40)}`);
  const f = line.split('\t');
  const ch = Number(m[2]);
  const vs = Number(m[3]);
  const kjv = /\[(\d+)\.(\d+)\]/.exec(m[4]);
  const na = /\((\d+)\.(\d+)\)/.exec(m[4]);
  return {
    book,
    ch,
    vs,
    kch: kjv ? Number(kjv[1]) : ch,
    kvs: kjv ? Number(kjv[2]) : vs,
    nch: na ? Number(na[1]) : ch,
    nvs: na ? Number(na[2]) : vs,
    wn: m[5],
    type: m[6],
    greek: f[1] ?? '',
    english: f[2] ?? '',
    tags: f[3] ?? '',
    editions: f[5] ?? '',
    meaningVariants: f[6] ?? '',
    subMeaning: f[9] ?? '',
  };
}

/** "ἀλλ᾽ (all᾽)" → ["ἀλλ᾽", "all᾽"]; "ἡμέρας.¶ (hēmeras)" → ["ἡμέρας.", "hēmeras"]. */
export function splitGreek(cell: string): { t: string; x: string } {
  const i = cell.lastIndexOf(' (');
  const greek = i >= 0 ? cell.slice(0, i) : cell;
  const x = i >= 0 ? cell.slice(i + 2).replace(/\)\s*$/, '') : '';
  return { t: greek.replace(/¶/g, '').trim(), x: x.trim() };
}

/** Drops an inline verse marker at the start of a gloss: "[13] Greet", "(39) in", "{14.24} To Him". */
export function cleanGreekGloss(english: string): string {
  return english.replace(/^\s*[[({]\d+(?:\.\d+)?[\])}]\s*/, '').trim();
}

/** "G1473=P-1NS + G2532=CONJ" → dStrongs ["G1473", "G2532"] and code "P-1NS + CONJ". */
export function splitGreekTags(tags: string): { dStrongs: string[]; m: string } {
  const parts = tags.split(/\s+\+\s+/).map((p) => p.trim()).filter(Boolean);
  const dStrongs: string[] = [];
  const codes: string[] = [];
  for (const p of parts) {
    const i = p.indexOf('=');
    const id = i >= 0 ? p.slice(0, i) : p;
    // Alternative-tag forms: "G0846|G3165«G3450" → the dStrong before "«".
    const d = id.split('«')[0].split('|').pop()!.trim();
    dStrongs.push(d);
    if (i >= 0) codes.push(p.slice(i + 1).trim());
  }
  return { dStrongs, m: codes.join(' + ') };
}

/** True when the edition list includes all eight main editions (ignoring word-order suffixes). */
export function inAllEditions(editions: string): boolean {
  const tokens = new Set(editionTokens(editions));
  return ALL_EDITIONS.every((e) => tokens.has(e));
}

/** Edition list for display: displacement suffixes removed ("TR»1+Byz»1" → "TR+Byz"). */
export function cleanEditions(editions: string): string {
  return editionTokens(editions).join('+');
}

/** TAGNT sub-meaning column for names: "Jesus»Jesus|Jesus@Mat.1.1" → "Jesus|Jesus@Mat.1.1". */
export function tagntName(subMeaning: string): string | null {
  if (!subMeaning.includes('@')) return null;
  const parts = subMeaning.split('»');
  return parts[parts.length - 1].trim() || null;
}

export function tagntWord(row: TagntRow, resolveExt: ExtResolver, resolveName: NameResolver): OrigWord {
  const { t, x } = splitGreek(row.greek);
  const { dStrongs, m } = splitGreekTags(row.tags);
  const s = baseStrong(dStrongs[0] ?? '');
  if (!s) throw new Error(`TAGNT ${row.book}.${row.ch}.${row.vs}#${row.wn}: bad tags "${row.tags}"`);
  const word: OrigWord = { t, x, g: cleanGreekGloss(row.english), s, m };
  const e = resolveExt(dStrongs[0]);
  if (e) word.e = e;
  if (!inAllEditions(row.editions)) word.ed = cleanEditions(row.editions);
  const raw = tagntName(row.subMeaning);
  if (raw) {
    const pn = resolveName(raw, dStrongs);
    if (pn) word.pn = pn;
  }
  return word;
}

/**
 * Meaning-variant readings of a TAGNT word, e.g.
 * "Ἀμών (t=Amōn) Amon - G0300=N-ASM-P in: TR+Byz ¦ …". Multi-word readings keep " + " between the
 * Strong's numbers and codes of their words ("G1199 + G3165", "N-DPM + P-1GS").
 */
export function parseMeaningVariants(cell: string): Omit<VariantUnit, 'w'>[] {
  const out: Omit<VariantUnit, 'w'>[] = [];
  for (const raw of cell.split('¦')) {
    const reading = raw.trim();
    if (!reading) continue;
    const m = /^(.*?)\s+\(([A-Za-z])=([^)]*)\)\s+(.*?)\s+-\s+(\S.*?)\s+in:\s*(\S+)\s*$/.exec(reading);
    if (!m) throw new Error(`TAGNT: unparsed meaning variant "${reading}"`);
    const { dStrongs, m: code } = splitGreekTags(m[5]);
    const unit: Omit<VariantUnit, 'w'> = {
      t: m[1].trim(),
      g: m[4].trim(),
      ed: cleanEditions(m[6]),
      k: 'alt',
    };
    const strongs = dStrongs.map((d) => baseStrong(d)).filter((d): d is string => !!d);
    if (strongs.length) unit.s = strongs.join(' + ');
    if (code) unit.m = code;
    out.push(unit);
  }
  return out;
}

/** Variant units for one TAGNT word at index `w` of its KJV verse. */
export function tagntVariants(row: TagntRow, word: OrigWord, w: number): VariantUnit[] {
  const units: VariantUnit[] = [];
  if (word.ed) units.push({ w, t: word.t, g: word.g, ed: word.ed, k: 'presence' });
  if (row.meaningVariants.trim()) for (const u of parseMeaningVariants(row.meaningVariants)) units.push({ w, ...u });
  return units;
}

// ---------------------------------------------------------------------------------------------
// Grouping words into KJV chapters

interface VerseAcc {
  words: OrigWord[];
  /** Source (Hebrew or Greek-edition) chapter:verse of each word, deduplicated in order. */
  src: [number, number][];
}

/** Collects the words of one book by KJV chapter and verse, in source order. */
export class BookAccumulator {
  readonly chapters = new Map<number, Map<number, VerseAcc>>();

  constructor(
    readonly book: BookCode,
    readonly lang: 'hbo' | 'grc',
  ) {}

  /** Adds a word and returns its index within the KJV verse. */
  add(ch: number, vs: number, srcCh: number, srcVs: number, word: OrigWord): number {
    let verses = this.chapters.get(ch);
    if (!verses) this.chapters.set(ch, (verses = new Map()));
    let acc = verses.get(vs);
    if (!acc) verses.set(vs, (acc = { words: [], src: [] }));
    const last = acc.src[acc.src.length - 1];
    if (!last || last[0] !== srcCh || last[1] !== srcVs) acc.src.push([srcCh, srcVs]);
    acc.words.push(word);
    return acc.words.length - 1;
  }

  /** Ensures a verse exists even if it has no words. */
  touch(ch: number, vs: number) {
    let verses = this.chapters.get(ch);
    if (!verses) this.chapters.set(ch, (verses = new Map()));
    if (!verses.has(vs)) verses.set(vs, { words: [], src: [] });
  }

  toChapters(): OrigChapter[] {
    return [...this.chapters.keys()]
      .sort((a, b) => a - b)
      .map((c) => {
        const verses = this.chapters.get(c)!;
        const v: OrigVerse[] = [...verses.keys()]
          .sort((a, b) => a - b)
          .map((n) => {
            const acc = verses.get(n)!;
            const verse: OrigVerse = { n, w: acc.words };
            if (acc.src.length && (acc.src.length > 1 || acc.src[0][0] !== c || acc.src[0][1] !== n)) {
              verse.src = formatSourceRefs(acc.src);
            }
            return verse;
          });
        return { b: this.book, c, lang: this.lang, v };
      });
  }
}

/**
 * Strong's numbers a Hebrew word contributes to the concordance: its root and any other lexical
 * morphemes. Affix and punctuation tags (H9001–H9049) are left out, so a word made only of affixes
 * (בּוֹ "in it" = H9003 + H9033) contributes nothing.
 */
export function wordStrongs(word: OrigWord): string[] {
  return (word.p ? word.p.map((p) => p.s) : [word.s]).filter((s) => !/^H9\d{3}$/.test(s));
}
