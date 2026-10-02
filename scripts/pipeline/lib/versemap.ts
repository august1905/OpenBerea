// Versification mapping for OpenBible.info data: English (ESV-style) verse numbers → KJV numbers.
//
// Source: STEPBible TVTMS ("Translators Versification Traditions with Methodology for
// Standardisation", CC BY 4.0, STEPBible-Data commit b99716b0cddb648ddb95cc786a197180f2f97d48).
// Only the numbering facts are used at build time; no TVTMS text is shipped.
//
// Approach
// --------
// 1. TVTMS expresses the English-vs-KJV differences directly. Its header section "Differences
//    between KJV and other English versions" says "In the OT, all English versions agree with KJV"
//    and gives a table of the NT places where KJV differs, one column per tradition
//    (NA/SBLG, NET2full/NRSV, ESV, NIV, KJV). Each row is one text unit in every column, and "*"
//    marks a cell whose numbering differs from KJV. We parse that table and pair each verse of the
//    chosen column (ESV by default; NRSV is available) with the KJV verse holding the same text.
//    A source verse split across KJV verses ("Rev.12:17a" / "Rev.12:17b") maps to the KJV verse of
//    its first part. TVTMS recommends exactly this for ESV Rev 12:17 ("better to leave
//    versification uncorrected").
// 2. Every pair taken from the table must be confirmed by a verse-level row of TVTMS's Expanded
//    data (SourceRef → StandardRef). Otherwise buildVerseMap throws, so a changed TVTMS fails loudly.
// 3. Phil 1:16/17 is a text-order difference (critical text vs. TR), not a numbering difference:
//    both numberings have both verses. It matters for data keyed by a translation's text, not for
//    data keyed by KJV verse numbers. OpenBible.info's cross-references come mostly from the
//    Treasury of Scripture Knowledge, which is keyed to the KJV. Its Phil.1.16 rows point to the
//    "not sincerely" texts (2 Cor 2:17, Job 6:14), and its Phil.1.17 rows to the "defence of the
//    gospel" texts (Acts 22:1, 26:1), so they follow KJV order. The swap is therefore applied only
//    with `contentOrder: true`.
// 4. Fallback for a ref that is still not a KJV verse after step 1 (for example Rev.12.18 from
//    NRSV-style data, or the Rom 16:25-27 doxology placed at Rom 14:24-26 in Byzantine-style
//    Bibles): TVTMS Expanded NT rows whose SourceRef is that single verse, used only when all such
//    rows agree on one KJV StandardRef. This cannot clash with a real KJV verse, because the KJV has
//    no verse with that number.
// 5. Anything else that is not a KJV verse (src/lib/bible/versification.ts) maps to null. Callers
//    count and report those refs.
//
// Result for ESV, checked by the "versemap" stage: the only renumbering is 3John.1.15 → 3JN.1.14.
// Acts 19:40-41, 2 Cor 13:12-14, Rev 12:17/13:1, Rom 16:24-27 and the whole OT are identical in
// ESV and KJV. The verses that ESV omits (Matt 17:21, Acts 8:37, …) simply have no data.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type BookCode, bookInfo, isBookCode } from '../../../src/lib/bible/books';
import { verseCount } from '../../../src/lib/bible/versification';
import { CACHE, download } from './context';

export const TVTMS_COMMIT = 'b99716b0cddb648ddb95cc786a197180f2f97d48';
export const TVTMS_NAME =
  'TVTMS - Translators Versification Traditions with Methodology for Standardisation for Eng+Heb+Lat+Grk+Others - STEPBible.org CC BY.txt';
export const TVTMS_URL = `https://raw.githubusercontent.com/STEPBible/STEPBible-Data/${TVTMS_COMMIT}/Versification/${encodeURIComponent(TVTMS_NAME)}`;
export const TVTMS_SHA256 = '63058e0f20201af4bdaa7d830da5be8f493455d947c5f147d84840b33db9ddf8';
export const TVTMS_PATH = join(CACHE, 'stepbible', TVTMS_NAME);

/** Downloads (or checks the cached copy of) the pinned TVTMS file. */
export async function ensureTvtms() {
  return download(TVTMS_URL, 'stepbible', TVTMS_NAME, TVTMS_SHA256);
}

export interface VerseRef {
  book: BookCode;
  chapter: number;
  verse: number;
}

/** table: renumbering from TVTMS's English table; reorder: text-order swap; fallback: Expanded NT row. */
export type RuleKind = 'table' | 'reorder' | 'fallback';

export interface VerseRule {
  /** Source verse key "3JN.1.15". */
  from: string;
  /** KJV verse key "3JN.1.14". */
  to: string;
  kind: RuleKind;
}

export interface MappedVerse extends VerseRef {
  /** Set when the number changed. */
  rule?: RuleKind;
}

export type EnglishScheme = 'esv' | 'nrsv';

export interface VerseMapOptions {
  /** Which column of TVTMS's English table describes the source. Default "esv". */
  scheme?: EnglishScheme;
  /** Apply text-order differences (Phil 1:16/17). Default false; see the header comment. */
  contentOrder?: boolean;
}

export interface VerseMapper {
  readonly scheme: EnglishScheme;
  /** Active non-identity rules, in table order and then fallback order. */
  readonly rules: readonly VerseRule[];
  /** Maps one verse to KJV numbering, or null when there is no KJV verse for it. */
  map(book: BookCode, chapter: number, verse: number): MappedVerse | null;
  /** Parses an OSIS verse ("3John.1.15") and maps it; null for unparsable or unmappable refs. */
  mapOsis(osis: string): MappedVerse | null;
}

// ---------------------------------------------------------------------------------------------
// Book codes

/** OSIS book codes (as used by OpenBible.info and Theographic) → USFM-style codes. */
export const OSIS_BOOKS: Readonly<Record<string, BookCode>> = {
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Josh: 'JOS', Judg: 'JDG', Ruth: 'RUT',
  '1Sam': '1SA', '2Sam': '2SA', '1Kgs': '1KI', '2Kgs': '2KI', '1Chr': '1CH', '2Chr': '2CH', Ezra: 'EZR',
  Neh: 'NEH', Esth: 'EST', Job: 'JOB', Ps: 'PSA', Prov: 'PRO', Eccl: 'ECC', Song: 'SNG', Isa: 'ISA',
  Jer: 'JER', Lam: 'LAM', Ezek: 'EZK', Dan: 'DAN', Hos: 'HOS', Joel: 'JOL', Amos: 'AMO', Obad: 'OBA',
  Jonah: 'JON', Mic: 'MIC', Nah: 'NAM', Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL',
  Matt: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT', Rom: 'ROM', '1Cor': '1CO', '2Cor': '2CO',
  Gal: 'GAL', Eph: 'EPH', Phil: 'PHP', Col: 'COL', '1Thess': '1TH', '2Thess': '2TH', '1Tim': '1TI',
  '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM', Heb: 'HEB', Jas: 'JAS', '1Pet': '1PE', '2Pet': '2PE',
  '1John': '1JN', '2John': '2JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV',
};

/** Parses an OSIS verse "Gen.1.1" (no range). Does not check that the verse exists. */
export function parseOsisVerse(osis: string): VerseRef | null {
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/.exec(osis.trim());
  const book = m ? OSIS_BOOKS[m[1]] : undefined;
  if (!m || !book) return null;
  return { book, chapter: Number(m[2]), verse: Number(m[3]) };
}

export function isKjvVerse(book: BookCode, chapter: number, verse: number): boolean {
  return verse >= 1 && verse <= verseCount(book, chapter);
}

export const verseKey = (r: VerseRef) => `${r.book}.${r.chapter}.${r.verse}`;

function parseKey(key: string): VerseRef {
  const [book, chapter, verse] = key.split('.');
  return { book: book as BookCode, chapter: Number(chapter), verse: Number(verse) };
}

// ---------------------------------------------------------------------------------------------
// TVTMS parsing

export interface TvtmsRef {
  book: BookCode;
  chapter: number;
  verse: number;
  endVerse?: number;
  /** Subverse letter: "Rev.12:17a", "3Jn.1:14!b". */
  part?: string;
}

/**
 * Parses a TVTMS ref: "Act.19:40", "Act.19:40-41", "Rev.12:17a", "3Jn.1:14!b", and the typo form
 * "Rev.13.1". TVTMS book codes are the USFM codes in title case. Returns null for books outside the
 * Protestant canon, titles ("Psa.51:Title"), lists ("Rev.12:18; 13:1") and cross-chapter ranges.
 */
export function parseTvtmsRef(raw: string): TvtmsRef | null {
  const m = /^([1-3]?[A-Za-z]{2,3})\.(\d+)[:.](\d+)(?:-(\d+))?(?:!?([a-z]))?$/.exec(raw.trim().replace(/^\*/, ''));
  if (!m) return null;
  const code = m[1].toUpperCase();
  if (!isBookCode(code)) return null;
  const ref: TvtmsRef = { book: code, chapter: Number(m[2]), verse: Number(m[3]) };
  if (m[4]) ref.endVerse = Number(m[4]);
  if (m[5]) ref.part = m[5];
  return ref;
}

function versesOf(r: TvtmsRef): VerseRef[] {
  const out: VerseRef[] = [];
  for (let v = r.verse; v <= (r.endVerse ?? r.verse); v++) out.push({ book: r.book, chapter: r.chapter, verse: v });
  return out;
}

export interface EnglishTable {
  /** Column names, e.g. ["NA/ SBLG", "NET2full/ NRSV", "ESV", "NIV", "KJV"]. */
  columns: string[];
  rows: string[][];
}

/** Finds and parses the "Differences between KJV and other English versions" table. */
export function parseEnglishTable(text: string): EnglishTable {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('NA/ SBLG\t'));
  if (start < 0) throw new Error('TVTMS: English versions table not found');
  const header = lines[start].split('\t');
  const kjv = header.indexOf('KJV');
  if (kjv < 0 || !header.includes('ESV')) throw new Error('TVTMS: English table has no KJV/ESV column');
  const columns = header.slice(0, kjv + 1);
  const rows: string[][] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const cells = lines[i].split('\t');
    if (!cells[0] || cells[0] === ',') break;
    rows.push(cells.slice(0, kjv + 1).map((c) => c.trim()));
  }
  if (!rows.length) throw new Error('TVTMS: English table is empty');
  return { columns, rows };
}

const SCHEME_COLUMN: Record<EnglishScheme, string> = { esv: 'ESV', nrsv: 'NET2full/ NRSV' };

/** Non-identity verse pairs from one column of the English table (before reorder filtering). */
export function tableRules(table: EnglishTable, scheme: EnglishScheme): VerseRule[] {
  const col = table.columns.indexOf(SCHEME_COLUMN[scheme]);
  const kjvCol = table.columns.indexOf('KJV');
  if (col < 0) throw new Error(`TVTMS: English table has no column ${SCHEME_COLUMN[scheme]}`);
  const targets = new Map<string, string>();
  for (const row of table.rows) {
    const src = parseTvtmsRef(row[col]);
    const kjv = parseTvtmsRef(row[kjvCol]);
    if (!src || !kjv) throw new Error(`TVTMS: cannot parse English table row ${row.join(' | ')}`);
    // A later part of a split source verse ("17b") doesn't move the verse; its first part decides.
    if (src.part && src.part !== 'a') continue;
    const from = versesOf(src);
    const to = versesOf(kjv);
    let pairs: [VerseRef, VerseRef][];
    if (from.length === to.length) pairs = from.map((f, i) => [f, to[i]]);
    else if (to.length === 1) pairs = from.map((f) => [f, to[0]]);
    else if (from.length === 1) pairs = [[from[0], to[0]]];
    else throw new Error(`TVTMS: unaligned English table row ${row.join(' | ')}`);
    for (const [f, t] of pairs) {
      const prev = targets.get(verseKey(f));
      if (prev && prev !== verseKey(t)) throw new Error(`TVTMS: conflicting targets for ${verseKey(f)}`);
      targets.set(verseKey(f), verseKey(t));
    }
  }
  const rules: VerseRule[] = [];
  for (const [from, to] of targets) {
    if (from === to) continue;
    // A swap (a→b and b→a) is a text-order difference, not a renumbering.
    const kind: RuleKind = targets.get(to) === from ? 'reorder' : 'table';
    rules.push({ from, to, kind });
  }
  return rules;
}

export interface ExpandedRow {
  sourceType: string;
  sourceRef: string;
  standardRef: string;
  action: string;
}

/** Rows between #DataStart(Expanded) and #DataEnd(Expanded). */
export function parseExpandedRows(text: string): ExpandedRow[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('#DataStart(Expanded)'));
  const end = lines.findIndex((l) => l.startsWith('#DataEnd(Expanded)'));
  if (start < 0 || end < start) throw new Error('TVTMS: Expanded data section not found');
  const rows: ExpandedRow[] = [];
  for (const line of lines.slice(start + 1, end)) {
    const c = line.split('\t');
    if (!c[0] || !c[1] || c[0] === 'SourceType' || c[0].startsWith("'") || c[0].startsWith('#')) continue;
    rows.push({ sourceType: c[0].trim(), sourceRef: c[1].trim(), standardRef: (c[2] ?? '').trim(), action: (c[3] ?? '').trim() });
  }
  return rows;
}

/** True when some Expanded row maps the whole source verse `from` to a KJV ref within verse `to`. */
export function expandedConfirms(rows: ExpandedRow[], rule: VerseRule): boolean {
  return rows.some((r) => {
    const s = parseTvtmsRef(r.sourceRef);
    const t = parseTvtmsRef(r.standardRef);
    return !!s && !!t && !s.endVerse && !s.part && !t.endVerse && verseKey(s) === rule.from && verseKey(t) === rule.to;
  });
}

/**
 * Fallback rules from the Expanded NT rows: a whole source verse that is not a KJV verse, whose rows
 * all agree on one KJV target verse (e.g. Rev.12:18 → Rev.13:1, Rom.14:24 → Rom.16:25).
 */
export function fallbackRules(rows: ExpandedRow[]): VerseRule[] {
  const targets = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = parseTvtmsRef(r.sourceRef);
    const t = parseTvtmsRef(r.standardRef);
    if (!s || !t || s.endVerse || s.part || t.endVerse) continue;
    if (bookInfo(s.book).testament !== 'NT') continue;
    if (isKjvVerse(s.book, s.chapter, s.verse)) continue;
    const set = targets.get(verseKey(s)) ?? new Set<string>();
    set.add(verseKey(t));
    targets.set(verseKey(s), set);
  }
  const rules: VerseRule[] = [];
  for (const [from, set] of targets) {
    if (set.size !== 1) continue;
    const to = [...set][0];
    const t = parseKey(to);
    if (isKjvVerse(t.book, t.chapter, t.verse)) rules.push({ from, to, kind: 'fallback' });
  }
  return rules;
}

/** Builds a mapper from TVTMS text. Throws when the TVTMS data contradicts itself. */
export function buildVerseMap(text: string, opts: VerseMapOptions = {}): VerseMapper {
  const scheme = opts.scheme ?? 'esv';
  const table = parseEnglishTable(text);
  const expanded = parseExpandedRows(text);
  const fromTable = tableRules(table, scheme).filter((r) => opts.contentOrder || r.kind !== 'reorder');
  for (const r of fromTable) {
    if (!expandedConfirms(expanded, r)) throw new Error(`TVTMS: ${r.from} → ${r.to} (English table) has no Expanded row`);
    const t = parseKey(r.to);
    if (!isKjvVerse(t.book, t.chapter, t.verse)) throw new Error(`TVTMS: target ${r.to} is not a KJV verse`);
  }
  const primary = new Map(fromTable.map((r) => [r.from, r]));
  const fallback = new Map(fallbackRules(expanded).filter((r) => !primary.has(r.from)).map((r) => [r.from, r]));
  const rules = [...primary.values(), ...fallback.values()];

  const map = (book: BookCode, chapter: number, verse: number): MappedVerse | null => {
    const key = `${book}.${chapter}.${verse}`;
    const rule = primary.get(key);
    if (rule) return { ...parseKey(rule.to), rule: rule.kind };
    if (isKjvVerse(book, chapter, verse)) return { book, chapter, verse };
    const fb = fallback.get(key);
    if (fb) return { ...parseKey(fb.to), rule: 'fallback' };
    return null;
  };
  return {
    scheme,
    rules,
    map,
    mapOsis(osis: string) {
      const r = parseOsisVerse(osis);
      return r ? map(r.book, r.chapter, r.verse) : null;
    },
  };
}

/** Loads the cached, pinned TVTMS file (call ensureTvtms() first in a stage). */
export function loadVerseMap(opts: VerseMapOptions = {}): VerseMapper {
  if (!existsSync(TVTMS_PATH)) throw new Error(`TVTMS not in cache (${TVTMS_PATH}); run the "versemap" stage first`);
  return buildVerseMap(readFileSync(TVTMS_PATH, 'utf8'), opts);
}
