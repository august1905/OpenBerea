import { BOOK_CODES, type BookCode, bookByIndex, bookInfo, isBookCode } from './books';

/** A passage: a chapter, a verse, or a verse range (possibly across chapters). */
export interface Ref {
  book: BookCode;
  chapter: number;
  verse?: number;
  endChapter?: number;
  endVerse?: number;
}

// English names and common abbreviations accepted by the quick-jump box. Keys are
// normalized: lower case, no spaces or periods, leading ordinals as digits.
const ALIASES: Record<BookCode, string[]> = {
  GEN: ['genesis', 'gen', 'ge', 'gn'],
  EXO: ['exodus', 'exod', 'exo', 'ex'],
  LEV: ['leviticus', 'lev', 'le', 'lv'],
  NUM: ['numbers', 'num', 'nu', 'nm', 'nb'],
  DEU: ['deuteronomy', 'deut', 'deu', 'de', 'dt'],
  JOS: ['joshua', 'josh', 'jos', 'jsh'],
  // "Jud." is Judges in older references (TSK, Easton); Jude is "Jude" or "Jd".
  JDG: ['judges', 'judg', 'jdg', 'jg', 'jdgs', 'jud'],
  RUT: ['ruth', 'rut', 'ru', 'rth'],
  '1SA': ['1samuel', '1sam', '1sa', '1sm', '1s', '1kingdoms'],
  '2SA': ['2samuel', '2sam', '2sa', '2sm', '2s', '2kingdoms'],
  '1KI': ['1kings', '1kgs', '1kin', '1ki', '1k'],
  '2KI': ['2kings', '2kgs', '2kin', '2ki', '2k'],
  '1CH': ['1chronicles', '1chron', '1chr', '1ch'],
  '2CH': ['2chronicles', '2chron', '2chr', '2ch'],
  EZR: ['ezra', 'ezr', 'ez'],
  NEH: ['nehemiah', 'neh', 'ne'],
  EST: ['esther', 'esth', 'est', 'es'],
  JOB: ['job', 'jb'],
  PSA: ['psalms', 'psalm', 'psa', 'ps', 'pss', 'psm', 'pslm'],
  PRO: ['proverbs', 'prov', 'pro', 'prv', 'pr'],
  ECC: ['ecclesiastes', 'eccles', 'eccl', 'ecc', 'ec', 'qoh', 'qoheleth'],
  SNG: ['songofsolomon', 'songofsongs', 'song', 'sos', 'sng', 'so', 'canticles', 'cant', 'canticleofcanticles'],
  ISA: ['isaiah', 'isa', 'is'],
  JER: ['jeremiah', 'jer', 'je', 'jr'],
  LAM: ['lamentations', 'lam', 'la'],
  EZK: ['ezekiel', 'ezek', 'eze', 'ezk'],
  DAN: ['daniel', 'dan', 'da', 'dn'],
  HOS: ['hosea', 'hos', 'ho'],
  JOL: ['joel', 'jol', 'jl'],
  AMO: ['amos', 'amo', 'am'],
  OBA: ['obadiah', 'obad', 'oba', 'ob'],
  JON: ['jonah', 'jon', 'jnh'],
  MIC: ['micah', 'mic', 'mc'],
  NAM: ['nahum', 'nah', 'nam', 'na'],
  HAB: ['habakkuk', 'hab', 'hb'],
  ZEP: ['zephaniah', 'zeph', 'zep', 'zp'],
  HAG: ['haggai', 'hag', 'hg'],
  ZEC: ['zechariah', 'zech', 'zec', 'zc'],
  MAL: ['malachi', 'mal', 'ml'],
  MAT: ['matthew', 'matt', 'mat', 'mt'],
  MRK: ['mark', 'mrk', 'mar', 'mk', 'mr'],
  LUK: ['luke', 'luk', 'lk', 'lu'],
  JHN: ['john', 'jhn', 'joh', 'jn'],
  ACT: ['acts', 'act', 'ac'],
  ROM: ['romans', 'rom', 'ro', 'rm'],
  '1CO': ['1corinthians', '1cor', '1co'],
  '2CO': ['2corinthians', '2cor', '2co'],
  GAL: ['galatians', 'gal', 'ga'],
  EPH: ['ephesians', 'ephes', 'eph'],
  PHP: ['philippians', 'phil', 'php', 'pp'],
  COL: ['colossians', 'col'],
  '1TH': ['1thessalonians', '1thess', '1thes', '1th'],
  '2TH': ['2thessalonians', '2thess', '2thes', '2th'],
  '1TI': ['1timothy', '1tim', '1ti', '1tm'],
  '2TI': ['2timothy', '2tim', '2ti', '2tm'],
  TIT: ['titus', 'tit', 'ti'],
  PHM: ['philemon', 'philem', 'phlm', 'phm', 'pm'],
  HEB: ['hebrews', 'heb'],
  JAS: ['james', 'jas', 'jm'],
  '1PE': ['1peter', '1pet', '1pe', '1pt', '1p'],
  '2PE': ['2peter', '2pet', '2pe', '2pt', '2p'],
  '1JN': ['1john', '1jhn', '1joh', '1jn', '1jo', '1j'],
  '2JN': ['2john', '2jhn', '2joh', '2jn', '2jo', '2j'],
  '3JN': ['3john', '3jhn', '3joh', '3jn', '3jo', '3j'],
  JUD: ['jude', 'jd'],
  REV: ['revelation', 'revelations', 'rev', 're', 'rv', 'apocalypse', 'apoc'],
};

const aliasMap = new Map<string, BookCode>();
for (const code of BOOK_CODES) {
  for (const alias of ALIASES[code]) aliasMap.set(alias, code);
}
for (const code of BOOK_CODES) {
  // Book codes ("rev", "1co") also work, unless an alias already claims them ("jud" = Judges).
  if (!aliasMap.has(code.toLowerCase())) aliasMap.set(code.toLowerCase(), code);
}

// Full names, for unique-prefix matching ("Deuter", "Phili" stays ambiguous → aliases decide).
const fullNames: [string, BookCode][] = BOOK_CODES.map((c) => [ALIASES[c][0], c]);

function normalizeBookName(raw: string): string {
  let s = raw.toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(first|1st|i)\s+/, '1').replace(/^(second|2nd|ii)\s+/, '2').replace(/^(third|3rd|iii)\s+/, '3');
  s = s.replace(/^the\s+/, '').replace(/^(book of|gospel of|epistle of)\s+/, '');
  s = s.replace(/^(song of) (solomon|songs)$/, 'songof$2');
  return s.replace(/\s/g, '');
}

/** Resolves a typed book name or abbreviation to its code. */
export function parseBookName(raw: string): BookCode | null {
  const key = normalizeBookName(raw);
  if (!key) return null;
  const direct = aliasMap.get(key);
  if (direct) return direct;
  if (key.length < 3) return null;
  const matches = fullNames.filter(([name]) => name.startsWith(key));
  return matches.length === 1 ? matches[0][1] : null;
}

// The verse separator (":", ".", "v") may only follow a chapter number, so "Lev 8", "Rev 12", and
// "Ps. 31" read as chapters, while "John 3v16" and "John 3.16" still read as verses.
const REF_PATTERN =
  /^\s*((?:[1-3]|i{1,3}|first|second|third|1st|2nd|3rd)?\s*[a-z][a-z .]*?)\.?\s*(?:(\d+)(?:\s*[:.v]\s*(\d+))?(?:\s*[-–—]\s*(\d+)(?:\s*[:.]\s*(\d+))?)?)?\s*(?:[,;].*)?$/i;

/**
 * Parses a typed reference such as "Jn 3:16", "1 Cor 13", "Ps 23:1-6", "Gen 1:1-2:3", or "Jude 3".
 * Returns null when the book is unknown or the chapter doesn't exist. Verse numbers are
 * checked against the versification when one is supplied.
 */
export function parseReference(input: string, verseCount?: (book: BookCode, chapter: number) => number): Ref | null {
  const m = REF_PATTERN.exec(input);
  if (!m) return null;
  const book = parseBookName(m[1]);
  if (!book) return null;
  const info = bookInfo(book);
  const nums = [m[2], m[3], m[4], m[5]].map((n) => (n === undefined ? undefined : Number(n)));
  let [chapter, verse, end1, end2] = nums;

  // Single-chapter books: "Jude 3" means verse 3, "Jude 1:3" also works.
  if (info.chapters === 1 && chapter !== undefined && verse === undefined && !(chapter === 1 && end1 === undefined)) {
    if (end1 !== undefined && end2 !== undefined) return null;
    return finalize({ book, chapter: 1, verse: chapter, endVerse: end1 }, verseCount);
  }

  if (chapter === undefined) return { book, chapter: 1 };
  if (chapter < 1 || chapter > info.chapters) return null;
  const ref: Ref = { book, chapter };
  if (verse !== undefined) {
    ref.verse = verse;
    if (end1 !== undefined && end2 !== undefined) {
      ref.endChapter = end1;
      ref.endVerse = end2;
    } else if (end1 !== undefined) {
      ref.endVerse = end1;
    }
  } else if (end1 !== undefined) {
    // "Ps 1-3" is a chapter range: keep the first chapter.
    if (end1 < chapter || end1 > info.chapters) return null;
  }
  return finalize(ref, verseCount);
}

function finalize(ref: Ref, verseCount?: (book: BookCode, chapter: number) => number): Ref | null {
  if (ref.verse !== undefined && ref.verse < 1) return null;
  if (ref.endChapter !== undefined) {
    if (ref.endChapter < ref.chapter || ref.endChapter > bookInfo(ref.book).chapters) return null;
    if (ref.endChapter === ref.chapter) delete ref.endChapter;
  }
  if (ref.endVerse !== undefined && ref.endChapter === undefined && ref.verse !== undefined && ref.endVerse < ref.verse) {
    return null;
  }
  if (ref.endVerse !== undefined && ref.endChapter === undefined && ref.endVerse === ref.verse) delete ref.endVerse;
  if (verseCount && ref.verse !== undefined) {
    if (ref.verse > verseCount(ref.book, ref.chapter)) return null;
    const endCh = ref.endChapter ?? ref.chapter;
    if (ref.endVerse !== undefined && ref.endVerse > verseCount(ref.book, endCh)) return null;
  }
  return ref;
}

// ---------------------------------------------------------------------------
// Compact reference strings used in data files: "JHN.3", "JHN.3.16", "JHN.3.16-18", "JHN.3.16-4.2".

export function toCompact(ref: Ref): string {
  let s = `${ref.book}.${ref.chapter}`;
  if (ref.verse === undefined) return s;
  s += `.${ref.verse}`;
  if (ref.endChapter !== undefined) s += `-${ref.endChapter}.${ref.endVerse ?? 1}`;
  else if (ref.endVerse !== undefined) s += `-${ref.endVerse}`;
  return s;
}

const COMPACT = /^([1-3A-Z]{3})\.(\d+)(?:\.(\d+)(?:-(\d+)(?:\.(\d+))?)?)?$/;

export function fromCompact(s: string): Ref | null {
  const m = COMPACT.exec(s);
  if (!m || !isBookCode(m[1])) return null;
  const ref: Ref = { book: m[1], chapter: Number(m[2]) };
  if (m[3]) ref.verse = Number(m[3]);
  if (m[4] && m[5]) {
    ref.endChapter = Number(m[4]);
    ref.endVerse = Number(m[5]);
  } else if (m[4]) {
    ref.endVerse = Number(m[4]);
  }
  return ref;
}

// ---------------------------------------------------------------------------
// Integer verse ids used in concordance data: book index × 1,000,000 + chapter × 1,000 + verse.

export function verseId(book: BookCode, chapter: number, verse: number): number {
  return bookInfo(book).index * 1_000_000 + chapter * 1000 + verse;
}

export function fromVerseId(id: number): { book: BookCode; chapter: number; verse: number } {
  const book = bookByIndex(Math.floor(id / 1_000_000))!.code;
  return { book, chapter: Math.floor((id % 1_000_000) / 1000), verse: id % 1000 };
}

/** True when the two refs cover at least one shared verse (chapter-only refs cover the whole chapter). */
export function refContainsVerse(ref: Ref, book: BookCode, chapter: number, verse: number): boolean {
  if (ref.book !== book) return false;
  const endCh = ref.endChapter ?? ref.chapter;
  if (chapter < ref.chapter || chapter > endCh) return false;
  if (ref.verse === undefined) return true;
  const start = chapter === ref.chapter ? ref.verse : 1;
  const end =
    chapter === endCh ? (ref.endVerse ?? (ref.endChapter === undefined ? ref.verse : Infinity)) : Infinity;
  return verse >= start && verse <= end;
}
