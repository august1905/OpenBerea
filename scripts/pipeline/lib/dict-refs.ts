// Scripture references in CrossWire dictionary markup (TEI <ref osisRef>, ThML <scripRef passage>,
// and plain prose), checked against the displayed text and the KJV versification.
//
// The TEI modules' osisRef attributes were generated automatically and are often wrong when the
// text omits the book: Easton "Ex. 4:14,27-30" has osisRef Gen.1.27-30 on "27-30", ISBE continues
// "Jud 5:6; 8:2" with Rev.7.2, and Nave splits "2Jo 1:6" into a link "2Jo 1" plus ":6". So every
// tagged ref is re-read from its own text, with the book and chapter of the preceding ref as
// context, and the attribute is kept only when the two agree. Refs outside the KJV versification
// (including the Apocrypha) are dropped and counted.
import { type BookCode, bookInfo } from '../../../src/lib/bible/books';
import { fromCompact, parseBookName, type Ref, toCompact } from '../../../src/lib/bible/refs';
import { verseCount } from '../../../src/lib/bible/versification';
import { bookToOsis } from './osis-books';
import { osisRefToCompact } from './osis-refs';
import { decodeEntities, linkRefs } from './richtext';

// ---------------------------------------------------------------------------------------------
// Ref helpers

/** True when the ref's chapters and verses exist in the KJV versification. */
export function isValidRef(ref: Ref): boolean {
  const chapters = bookInfo(ref.book).chapters;
  if (ref.chapter < 1 || ref.chapter > chapters) return false;
  if (ref.verse !== undefined && (ref.verse < 1 || ref.verse > verseCount(ref.book, ref.chapter))) return false;
  const endCh = ref.endChapter ?? ref.chapter;
  if (endCh < ref.chapter || endCh > chapters) return false;
  if (ref.endVerse !== undefined) {
    if (ref.verse === undefined || ref.endVerse < 1 || ref.endVerse > verseCount(ref.book, endCh)) return false;
    if (endCh === ref.chapter && ref.endVerse < ref.verse) return false;
  }
  return true;
}

/** A compact ref ("EXO.6.20", "ROM.8.28-30", "LEV.8") that exists in the KJV versification. */
export function isValidCompact(compact: string): boolean {
  const ref = fromCompact(compact);
  return !!ref && isValidRef(ref) && toCompact(ref) === compact;
}

/** First and last verse covered (a chapter ref covers the whole chapter). */
function span(ref: Ref): string {
  const endCh = ref.endChapter ?? ref.chapter;
  const v1 = ref.verse ?? 1;
  const v2 = ref.endVerse ?? (ref.verse !== undefined && ref.endChapter === undefined ? ref.verse : verseCount(ref.book, endCh));
  return `${ref.book}.${ref.chapter}.${v1}-${endCh}.${v2}`;
}

/**
 * Whether an attribute ref agrees with what the text says. When the text has no explicit end, only
 * the start is compared (the text "Ex. 4:14" agrees with osisRef Exod.4.14-Exod.4.16).
 */
function agrees(attr: Ref, text: Ref, textHasEnd: boolean): boolean {
  if (attr.book !== text.book || attr.chapter !== text.chapter) return false;
  if (text.verse === undefined) return (attr.verse ?? 1) === 1 && (!textHasEnd || span(attr) === span(text));
  if (attr.verse !== text.verse) return false;
  return !textHasEnd || span(attr) === span(text);
}

function make(book: BookCode, chapter: number, verse?: number, endChapter?: number, endVerse?: number): Ref | null {
  const ref: Ref = { book, chapter };
  if (verse !== undefined) ref.verse = verse;
  if (endChapter !== undefined && endChapter !== chapter) {
    ref.endChapter = endChapter;
    ref.endVerse = endVerse;
  } else if (endVerse !== undefined && endVerse !== verse) ref.endVerse = endVerse;
  return isValidRef(ref) ? ref : null;
}

export interface RefContext {
  book: BookCode;
  chapter: number;
  /** The context ref named a verse (so a bare number after a comma is a verse). */
  verse: boolean;
}

export function contextOf(ref: Ref): RefContext {
  return { book: ref.book, chapter: ref.endChapter ?? ref.chapter, verse: ref.verse !== undefined };
}

// ---------------------------------------------------------------------------------------------
// Reading reference text

// The dictionaries write "Jud" for Judges (Jude is "Jude"); refs.ts reads "jud" as Jude. "Ez" is
// Ezekiel in ISBE but Ezra in refs.ts: treated as ambiguous (null).
// "Solomon 4:8" (the text of a ref whose "Song of" fell outside the tag) is the Song of Solomon.
const BOOK_OVERRIDES: Record<string, BookCode | null> = { jud: 'JDG', ez: null, solomon: 'SNG' };

/** Book code of a book name or abbreviation as the dictionaries write them. */
export function dictBook(name: string): BookCode | null {
  const key = name.toLowerCase().replace(/[.\s]/g, '');
  return key in BOOK_OVERRIDES ? BOOK_OVERRIDES[key] : parseBookName(name);
}

// Book names in prose that name a book (or the prophet whose book it is) rather than a people or a
// common word: "Romans", "Hebrews", "Numbers", "Judges" are left out unless written as "Epistle to
// the Romans". Used to choose the book of a bare ref ("by Amos (1:4)", "Deuteronomy … (12:5)").
const BOOK_WORDS = [
  'Genesis', 'Exodus', 'Leviticus', 'Deuteronomy', 'Ruth', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms?', 'Proverbs',
  'Ecclesiastes', 'Canticles', 'Lamentations', 'Isaiah', 'Jeremiah', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Acts', 'Revelation',
  'Apocalypse',
];
const NUMBERED_WORDS = ['Samuel', 'Kings', 'Chronicles', 'Corinthians', 'Thessalonians', 'Timothy', 'Peter', 'John'];
const PROSE_BOOK = new RegExp(
  `\\b(?:((?:[1-3]|I{1,3}|First|Second|Third)\\s+(?:${NUMBERED_WORDS.join('|')}))|(?:Epistle|Letter) to the (Romans|Galatians|Ephesians|Philippians|Colossians|Hebrews)|(${BOOK_WORDS.join('|')}))\\b`,
  'g',
);
const BOOK_WORD = new RegExp(`^(?:${BOOK_WORDS.join('|')})$`);

// Works outside the 66 books that the dictionaries cite by chapter and verse.
const OTHER_WORKS =
  /\b(?:Tobit|Tob|Judith|Jdt|Baruch|Bar|Maccabees|Macc|Ma|Ecclus|Ecclesiasticus|Sirach|Sir|Wisdom|Wisd|Wis|Esdras|Esd|Susanna|Enoch|Jubilees|Josephus|Ant|BJ|Apion|Talmud|Mishna|Koran|Iliad|Odyssey|Herodotus|Pliny|Strabo)\b\.?/g;

// An abbreviation right before a bare ref: "Ge (2:8)", "Jos (1:1)". Short common words are not
// books unless they are a common dictionary abbreviation directly before the ref.
const LEAD_ABBREV = /\b([1-3]?[A-Z][a-z]{1,4})\.?\s*\(?\s*$/;
const NOT_ABBREV = new Set(['is', 'so', 'am', 'in', 'on', 'as', 'at', 'to', 'me', 'he', 'ho', 'da', 'le', 'de', 're', 'la', 'na', 'ne', 'es', 'ac', 'ro', 'ge', 'job', 'mark', 'acts', 'see', 'comp', 'and']);

/** The last book named in prose (or abbreviated right before a ref): a book, "other" for a work outside the 66, or null. */
export function proseBook(text: string): BookCode | 'other' | null {
  let book: BookCode | 'other' | null = null;
  let at = -1;
  for (const m of text.matchAll(PROSE_BOOK)) {
    const b = parseBookName(m[1] ?? m[2] ?? m[3]);
    if (b) {
      book = b;
      at = m.index;
    }
  }
  for (const m of text.matchAll(OTHER_WORKS)) {
    if (m.index > at) {
      book = 'other';
      at = m.index;
    }
  }
  const abbrev = LEAD_ABBREV.exec(text);
  if (abbrev && (!NOT_ABBREV.has(abbrev[1].toLowerCase()) || /\b(?:Ge|De|Ac|Ro|Le|Re)\s*\(?\s*$/.test(text))) {
    book = dictBook(abbrev[1]) ?? book;
  }
  return book;
}

/**
 * The Bible book an entry is about, from its key: "ROMANS, EPISTLE TO THE" → ROM, "CORINTHIANS,
 * FIRST EPISTLE TO THE" → 1CO, "GENESIS" → GEN, "ISAIAH" → ISA. Null for other entries and for
 * names that are not only books ("JOHN", "KINGS, BOOKS OF").
 */
export function homeBook(key: string): BookCode | null {
  const m = /^([A-Z][A-Z ]*?)(?:,\s*(?:THE\s+)?(?:(FIRST|SECOND|THIRD)\s+)?(?:BOOK|BOOKS|EPISTLE|EPISTLES|GOSPEL|PROPHECIES|PROPHECY|SONG)\b[^;]*)?(?:\s*\(\d\))?$/.exec(key.trim());
  if (/^ACTS OF THE APOSTLES\b/.test(key)) return 'ACT';
  if (/^SONG OF (?:SOLOMON|SONGS)\b/.test(key)) return 'SNG';
  if (!m) return null;
  const ord = { FIRST: '1 ', SECOND: '2 ', THIRD: '3 ' }[m[2] ?? ''] ?? '';
  const name = m[1].trim();
  const title = name.charAt(0) + name.slice(1).toLowerCase();
  if (ord) return parseBookName(`${ord}${title}`);
  if (BOOK_WORD.test(title) || (m[0] !== name && /^(Numbers|Judges|Romans|Galatians|Ephesians|Philippians|Colossians|Hebrews)$/.test(title))) {
    return parseBookName(title);
  }
  // "MARK, GOSPEL ACCORDING TO", "JOHN, GOSPEL OF": names that are books only with the suffix.
  return m[0] !== name && /^(Mark|Luke|John|Jude|James)$/.test(title) && !/EPISTLES/.test(m[0]) ? parseBookName(title) : null;
}

/** The last of the 66 books named in prose, or null. */
export function lastBookInProse(text: string): BookCode | null {
  const book = proseBook(text);
  return book === 'other' ? null : book;
}

// "Ex. 6:20", "1 Chr. 2:10", "Lev. 8", "Matt. 5-7", "Acts 16:10-17:15", "Song of Solomon 2:1", "nu 26:59".
// (refs.ts parseReference is not used here: it reads "Ps. 31" and "Lev 8" as chapter 1, taking the
// period or the final "v" of the book name for a verse separator.)
const BOOK_PART = /^([1-3]\s?|I{1,3}\s)?([A-Za-z]+(?:\s+of\s+[A-Za-z]+)?)\.?\s*(?=\d)/;
const NUMBERS = /^(\d{1,3})(?:\s*:\s*(\d{1,3}))?(?:\s*[-–—]\s*(\d{1,3})(?:\s*:\s*(\d{1,3}))?)?$/;

/** Strips what follows or precedes the numbers without changing them: "ff", "f.", "f; ", "(", ")". */
function cleanRefText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:ff?\.?\s*[;,]\s*)/, '')
    .replace(/^\/[A-Za-z]+\s+/, '')
    .replace(/^[([]\s*/, '')
    .replace(/\s*(?:ff?\.?)?\s*[.,;:)\]]*$/, '')
    .trim();
}

function bookOf(prefix: string | undefined, name: string): BookCode | null {
  const ord = prefix ? prefix.trim().replace(/^III$/, '3').replace(/^II$/, '2').replace(/^I$/, '1') : '';
  return dictBook(`${ord}${name}`);
}

function numbersRef(book: BookCode, nums: string): Ref | null {
  const m = NUMBERS.exec(nums.trim());
  if (!m) return null;
  const [c, v, a, b] = [m[1], m[2], m[3], m[4]].map((x) => (x === undefined ? undefined : Number(x)));
  if (bookInfo(book).chapters === 1 && v === undefined && c !== 1) {
    // "Jude 3", "Jude 3-5": verses of the only chapter.
    return b === undefined ? make(book, 1, c, undefined, a) : null;
  }
  if (v === undefined) {
    if (b !== undefined) return null;
    return a === undefined ? make(book, c!) : make(book, c!, 1, a, verseCount(book, a));
  }
  return b !== undefined ? make(book, c!, v, a, b) : make(book, c!, v, undefined, a);
}

/** Reads a reference that names its book. Chapter ranges become verse ranges ("Matt. 5-7" → MAT.5.1-7.29). */
export function parseRefWithBook(raw: string): Ref | null {
  const text = cleanRefText(raw);
  const m = BOOK_PART.exec(text);
  if (!m) return null;
  const book = bookOf(m[1], m[2]);
  return book ? numbersRef(book, text.slice(m[0].length)) : null;
}

/**
 * A range across two books ("1Ki 17-2Ki 8", "1Ki 22:51-2Ki 1:18"). The compact form cannot span
 * books, so the link covers the part in the first book; the context continues from the end.
 */
function crossBookRange(text: string): { ref: Ref; end: RefContext } | null {
  const m = /^(.+?\d)\s*[-–—]\s*((?:[1-3]\s?|I{1,3}\s)?[A-Za-z]+\.?\s*\d.*)$/.exec(text);
  if (!m) return null;
  const a = parseRefWithBook(m[1]);
  const b = parseRefWithBook(m[2]);
  if (!a || !b || a.book === b.book || bookInfo(b.book).index < bookInfo(a.book).index) return null;
  const last = bookInfo(a.book).chapters;
  const ref = make(a.book, a.chapter, a.verse ?? 1, last, verseCount(a.book, last));
  return ref ? { ref, end: { book: b.book, chapter: b.endChapter ?? b.chapter, verse: b.verse !== undefined } } : null;
}

export interface TextReading {
  /** The text names a book ("Ex. 6:20"), so it does not depend on the context. */
  full: boolean;
  /** For full readings: the named book, or null when it is not a book of the 66 (e.g. "1 Macc."). */
  book?: BookCode | null;
  /** For full readings: the book name as written. */
  name?: string;
  /** The text gives an end ("27-30", "8:33-9:6"). */
  hasEnd: boolean;
  /** Possible readings, most likely first; all valid in the KJV versification. */
  refs: Ref[];
  /** Context after this ref when it is not the end of refs[0] (cross-book ranges). */
  after?: RefContext;
}

const CHAPTER_VERSE = /^(\d{1,3})\s*[:.]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?)?$/;
const BARE = /^(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/;
const VERSE_WORD = /^v(?:er|erse|s|v)?s?\.?\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/i;

/**
 * Reads the displayed text of a reference. `sep` is the text between the previous reference and
 * this one: after "," a bare number is a verse of the context chapter, after ";" a chapter.
 */
export function readRefText(raw: string, ctx: RefContext | null, sep = ''): TextReading {
  const text = cleanRefText(raw);
  const none: TextReading = { full: false, hasEnd: false, refs: [] };
  if (!/\d/.test(text)) {
    // A book name alone ("Acts" before "1:14, 2:46"): no ref, but it names the context book.
    const book = /^([1-3]\s?|I{1,3}\s)?([A-Za-z]{2,}(?:\s+of\s+[A-Za-z]+)?)\.?$/.exec(text);
    return book ? { ...none, full: true, book: bookOf(book[1], book[2]), name: text } : none;
  }
  const hasEnd = /\d\s*[-–—]\s*\d/.test(text);
  const cross = crossBookRange(text);
  if (cross) return { full: true, book: cross.ref.book, name: text, hasEnd: true, refs: [cross.ref], after: cross.end };
  const named = BOOK_PART.exec(text);
  if (named && !VERSE_WORD.test(text)) {
    const book = bookOf(named[1], named[2]);
    const ref = book ? numbersRef(book, text.slice(named[0].length)) : null;
    return { full: true, book, name: `${named[1] ?? ''}${named[2]}`, hasEnd, refs: ref ? [ref] : [] };
  }
  if (!ctx) return none;
  const cv = CHAPTER_VERSE.exec(text);
  if (cv) {
    const [c, v, a, b] = [cv[1], cv[2], cv[3], cv[4]].map((x) => (x === undefined ? undefined : Number(x)));
    const ref = b !== undefined ? make(ctx.book, c!, v, a, b) : make(ctx.book, c!, v, undefined, a);
    return { full: false, hasEnd, refs: ref ? [ref] : [] };
  }
  const vw = VERSE_WORD.exec(text);
  if (vw) {
    const ref = make(ctx.book, ctx.chapter, Number(vw[1]), undefined, vw[2] ? Number(vw[2]) : undefined);
    return { full: false, hasEnd, refs: ref ? [ref] : [] };
  }
  const bare = BARE.exec(text);
  if (bare) {
    const n = Number(bare[1]);
    const m = bare[2] ? Number(bare[2]) : undefined;
    const asVerse = make(ctx.book, ctx.chapter, n, undefined, m);
    const asChapter = m === undefined ? make(ctx.book, n) : make(ctx.book, n, 1, m, verseCount(ctx.book, m));
    const s = sep.trim();
    const verseFirst = s.endsWith(',') || (!s.endsWith(';') && ctx.verse);
    const refs = (verseFirst ? [asVerse, asChapter] : [asChapter, asVerse]).filter((r): r is Ref => !!r);
    return { full: false, hasEnd, refs };
  }
  return none;
}

export type RefStatus =
  /** The attribute agrees with the text. */
  | 'ok'
  /** The text could not be read (no context, or an odd form); the valid attribute was kept. */
  | 'unchecked'
  /** A book name without numbers: not linked, but it sets the context book. */
  | 'book'
  /** The text disagrees, but the attribute names its book explicitly and is trusted (ThML passage). */
  | 'kept'
  /** The attribute disagreed with the text or was invalid; the text's reading was used. */
  | 'fixed'
  /** Neither the attribute nor the text gives a valid KJV ref; the link was dropped. */
  | 'dropped';

export interface Resolved {
  ref: string | null;
  status: RefStatus;
  /** Why the attribute was not used. */
  reason?: string;
  /** The text names a book outside the 66 (Apocrypha): following continuations have no context. */
  unknownBook?: boolean;
  /** Context after this ref, when it differs from the ref itself. */
  after?: RefContext;
}

export type AttrRef = { ref: string } | { error: string };

/**
 * Chooses the compact ref for a tagged reference from its attribute (already converted to compact
 * form, or an error) and its displayed text. With `trustAttr` (ThML passages, which name their
 * book), a valid attribute is kept even when the text reads differently.
 */
export function resolveTagged(attr: AttrRef, text: string, ctx: RefContext | null, sep = '', trustAttr = false): Resolved {
  const reading = readRefText(text, ctx, sep);
  const attrText = 'ref' in attr ? attr.ref : attr.error;
  const a = 'ref' in attr ? fromCompact(attr.ref) : null;
  const aValid = a && isValidRef(a) ? a : null;
  const unknownBook = reading.full && reading.book === null;
  const after = reading.after;
  if (!/\d/.test(text)) {
    if (reading.book) return { ref: null, status: 'book', after: { book: reading.book, chapter: 1, verse: false } };
    return { ref: null, status: 'dropped', reason: `no numbers in "${text}"` };
  }
  // A book named in the prose since the previous ref ("Deuteronomy emphasizes … (12:5)").
  const named = !reading.full && ctx ? lastBookInProse(sep) : null;
  const namedReading = named && named !== ctx?.book ? readRefText(text, { book: named, chapter: 1, verse: false }, sep) : null;
  if (aValid) {
    const match = reading.refs.find((r) => agrees(aValid, r, reading.hasEnd));
    if (match) {
      // "Lev. 8" with osisRef Lev.8.1-Lev.8.36: keep the chapter form the text uses.
      const whole = match.verse === undefined && span(aValid) === span(match);
      return { ref: toCompact(whole ? match : aValid), status: 'ok', after };
    }
    if (trustAttr) return { ref: toCompact(aValid), status: 'kept', reason: `text "${text}" reads ${reading.refs.map(toCompact).join('/') || '-'}` };
    if (namedReading?.refs.some((r) => agrees(aValid, r, namedReading.hasEnd))) {
      return { ref: toCompact(aValid), status: 'ok' };
    }
    if (namedReading?.refs.length && /:/.test(text)) {
      return { ref: toCompact(namedReading.refs[0]), status: 'fixed', reason: `attribute ${attrText} disagrees with "${text}" after ${named} in the prose` };
    }
    if (reading.refs.length) return { ref: toCompact(reading.refs[0]), status: 'fixed', after, reason: `attribute ${attrText} disagrees with "${text}"` };
    if (reading.full) {
      // The text names a book but no valid ref could be read from it.
      const name = (reading.name ?? '').toLowerCase().replace(/\s/g, '');
      const sameBook = reading.book === aValid.book || (reading.book === null && name.length >= 2 &&
        (bookToOsis(aValid.book).toLowerCase().startsWith(name) || aValid.book.toLowerCase().startsWith(name)));
      if (sameBook) return { ref: toCompact(aValid), status: 'unchecked' };
      return { ref: null, status: 'dropped', unknownBook, reason: `text "${text}" names another book than ${attrText}` };
    }
    if (ctx && ctx.book !== aValid.book) {
      return { ref: null, status: 'dropped', reason: `attribute ${attrText} is in another book than the context ${ctx.book} and the text "${text}" does not fit either` };
    }
    return { ref: toCompact(aValid), status: 'unchecked' };
  }
  const reason = 'error' in attr ? attr.error : `invalid ${attrText}`;
  if (namedReading?.refs.length && /:/.test(text)) return { ref: toCompact(namedReading.refs[0]), status: 'fixed', reason: `${reason}; read after ${named} in the prose` };
  if (reading.refs.length) return { ref: toCompact(reading.refs[0]), status: 'fixed', after, reason };
  return { ref: null, status: 'dropped', unknownBook, reason };
}

// ---------------------------------------------------------------------------------------------
// Lists inside one tagged ref: <scripRef passage="nu 33:47,48">33:47,48</scripRef>

/** Splits "33:47,48; 34:2" into parts and separators: ["33:47", ",", "48", "; ", "34:2"]. */
export function splitRefList(text: string): string[] {
  return text.split(/(\s*[,;]\s*(?:and\s+)?)/).filter((p, i) => p !== '' || i % 2 === 0);
}

/** Expands a passage list with an explicit book ("nu 33:47,48") into one attribute per part. */
export function expandPassage(passage: string): AttrRef[] {
  // "re 22;13" / "2sa 15;24,29": a semicolon typed for the colon before any colon.
  const fixed = /^[^:]*\d;\d/.test(passage) ? passage.replace(/(\d);(\d)/, '$1:$2') : passage;
  const parts = splitRefList(fixed);
  const out: AttrRef[] = [];
  let ctx: RefContext | null = null;
  for (let i = 0; i < parts.length; i += 2) {
    const reading = readRefText(parts[i], ctx, parts[i - 1] ?? '');
    const ref = reading.refs[0];
    if (ref && (i > 0 || reading.full)) {
      out.push({ ref: toCompact(ref) });
      ctx = contextOf(ref);
    } else out.push({ error: `cannot read passage part "${parts[i]}" of "${passage}"` });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Bare references in prose: "(2:1,4; 7:7)" after "(Ex. 6:20)" means Exodus 2:1, 2:4 and 7:7.

// The word before a bare chapter:verse decides whether it is a reference that continues the
// context book: start of text or a bracket/punctuation, or one of these words.
const BARE_LEAD = /(?:^|[([;,]|\b(?:and|comp|cf|see|also|in|with|ver|vers|ch|chap|chapter|so|or|to|e\.g|i\.e|etc|ff|f))[.:]?\s*$/i;
const BARE_CV = /(\d{1,3})\s?:\s?(\d{1,3})(?:\s?[-–]\s?(\d{1,3})(?:\s?:\s?(\d{1,3}))?)?(?![\d:])/g;
/** The text between a ref and a bare ref only continues a list of refs: "; ", ", and ", " ff; ", "; comp. ". */
export function isContinuation(lead: string): boolean {
  return lead.length < 25 && /^\s*(?:ff?\.?)?\s*[;,]?\s*(?:and|compare|comp\.|cf\.|also|see|with|so|or)?\s*\(?\s*$/i.test(lead);
}

const CONTINUE = /^(\s*[;,]\s*(?:and\s+)?)(?:(\d{1,3})\s?:\s?(\d{1,3})|(\d{1,3}))(?:\s?[-–]\s?(\d{1,3}))?(?![\d:])/;
// A capitalized word or abbreviation right before a chapter:verse that linkRefs did not take is a
// book outside the 66 ("Ecclus. 24:15", "1 Macc. 4:47") or not a book: the context ends there.
const OTHER_BOOK = /\b[A-Z][a-z]+\.?\s*$/;

export interface ProsePiece {
  t: string;
  ref?: string;
}

export interface RefStats {
  /** Tagged refs by status. */
  ok: number;
  unchecked: number;
  book: number;
  kept: number;
  fixed: number;
  dropped: number;
  /** Prose refs with a book name (linkRefs) that were linked. */
  prose: number;
  /** Bare chapter:verse refs linked through the context book. */
  context: number;
  /** Prose refs outside the KJV versification, left unlinked. */
  proseInvalid: number;
  /** Tagged refs that were split or joined because of boundary errors in the source. */
  repaired: number;
  /** Examples of fixed and dropped refs, for the log. */
  samples: string[];
}

const COUNTERS = ['ok', 'unchecked', 'book', 'kept', 'fixed', 'dropped', 'prose', 'context', 'proseInvalid', 'repaired'] as const;

export function emptyRefStats(): RefStats {
  return { ok: 0, unchecked: 0, book: 0, kept: 0, fixed: 0, dropped: 0, prose: 0, context: 0, proseInvalid: 0, repaired: 0, samples: [] };
}

export function addRefStats(into: RefStats, from: RefStats, limit = 40) {
  for (const k of COUNTERS) into[k] += from[k];
  for (const s of from.samples) if (into.samples.length < limit) into.samples.push(s);
}

/** Number of tagged refs that ended up linked. */
export function linkedTagged(s: RefStats): number {
  return s.ok + s.unchecked + s.kept + s.fixed;
}

/**
 * Tracks the reference context through one entry and links refs in prose: refs with a book name
 * (richtext.linkRefs) and bare chapter:verse refs that continue the context book.
 */
export class RefLinker {
  ctx: RefContext | null = null;
  /** Text since the previous reference. */
  sep = '';
  readonly stats = emptyRefStats();

  constructor(
    readonly label = '',
    /** Link bare chapter:verse refs to the context book. */
    readonly contextual = true,
    /** Keep valid attributes even when the text reads differently (ThML passages). */
    readonly trustAttr = false,
    /** Statuses to record in stats.samples. */
    readonly sampleStatuses: RefStatus[] = ['fixed', 'dropped', 'kept'],
    /** Called for each bare ref linked through the context (for inspection). */
    readonly onContext?: (text: string, ref: string, before: string) => void,
    /** The book the entry is about (see homeBook). */
    readonly home: BookCode | null = null,
    /**
     * Link a bare ref through the context even after a stretch of prose with no book named (true
     * for Easton, whose bare refs continue the last-cited book; false for ISBE, where they often
     * cite a book named only by its author or subject).
     */
    readonly longLeads = true,
  ) {}

  private note(s: string) {
    if (this.stats.samples.length < 12) this.stats.samples.push(this.label ? `${this.label}: ${s}` : s);
  }

  /** Resolves a tagged ref and updates the context. */
  tagged(attr: AttrRef, text: string): Resolved {
    const r = resolveTagged(attr, text, this.ctx, this.sep, this.trustAttr);
    this.stats[r.status]++;
    if (this.sampleStatuses.includes(r.status)) this.note(`${r.status} "${text}" → ${r.ref ?? '-'} (${r.reason ?? ''})`);
    if (r.ref) this.setRef(r.ref);
    else {
      this.sep += text;
      if (r.unknownBook) this.ctx = null;
    }
    if (r.after) {
      this.ctx = r.after;
      this.sep = '';
    }
    return r;
  }

  setRef(compact: string) {
    const ref = fromCompact(compact);
    if (ref) this.ctx = contextOf(ref);
    this.sep = '';
  }

  /** Marks a hard break (paragraph or line): a following bare number is not a continuation. */
  breakLine() {
    this.sep += '\n';
  }

  /** Splits plain text into text and ref pieces. */
  prose(text: string): ProsePiece[] {
    const out: ProsePiece[] = [];
    const push = (t: string, ref?: string) => {
      if (!t) return;
      if (ref) {
        out.push({ t, ref });
        this.setRef(ref);
      } else {
        const last = out[out.length - 1];
        if (last && !last.ref) last.t += t;
        else out.push({ t });
        this.sep += t;
      }
    };
    for (const piece of linkRefs(text)) {
      if (typeof piece !== 'string' && piece.ref) {
        // linkRefs reads "Jud 5:6" as Jude; the dictionaries mean Judges.
        const name = /^((?:[1-3]|I{1,3})\s?)?([A-Za-z]+)/.exec(piece.t);
        let compact = piece.ref;
        if (name && !name[1] && BOOK_OVERRIDES[name[2].toLowerCase()]) {
          const fixed = parseRefWithBook(piece.t);
          compact = fixed ? toCompact(fixed) : '';
        }
        if (compact && isValidCompact(compact)) {
          this.stats.prose++;
          push(piece.t, compact);
        } else {
          this.stats.proseInvalid++;
          push(piece.t);
        }
        continue;
      }
      const t = typeof piece === 'string' ? piece : piece.t;
      if (this.contextual) this.bare(t, push);
      else push(t);
    }
    return out;
  }

  private bare(text: string, push: (t: string, ref?: string) => void) {
    let last = 0;
    BARE_CV.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BARE_CV.exec(text))) {
      const before = text.slice(0, m.index);
      if (/[\w.:–-]$/.test(before)) continue;
      const lead = this.sep + text.slice(last, m.index);
      if (!BARE_LEAD.test(lead)) {
        if (OTHER_BOOK.test(lead)) this.ctx = null;
        continue;
      }
      // A book named since the previous ref ("by Amos (1:4)") comes before the context book.
      const named = proseBook(lead);
      if (named === 'other') continue;
      const near = named && proseBook(lead.slice(-60)) === named;
      // In an article about a book, a bare ref that does not continue a ref list is in that book.
      const cont = isContinuation(lead);
      const home = this.home && !cont ? this.home : null;
      if (!cont && !named && !home && !this.longLeads) continue;
      const books = [named && (this.ctx || near) ? named : null, home, this.ctx?.book ?? null].filter((b): b is BookCode => !!b);
      const nums = [m[2], m[3], m[4]].map((x) => (x === undefined ? undefined : Number(x)));
      let first: Ref | null = null;
      for (const book of books) {
        first = nums[2] !== undefined
          ? make(book, Number(m[1]), nums[0], nums[1], nums[2])
          : make(book, Number(m[1]), nums[0], undefined, nums[1]);
        if (first) break;
      }
      if (!first) continue;
      push(text.slice(last, m.index));
      this.stats.context++;
      this.onContext?.(m[0], toCompact(first), lead);
      push(m[0], toCompact(first));
      let pos = m.index + m[0].length;
      for (;;) {
        const c = CONTINUE.exec(text.slice(pos));
        if (!c || !this.ctx) break;
        const ch = c[2] ? Number(c[2]) : this.ctx.chapter;
        const vs = c[2] ? Number(c[3]) : Number(c[4]);
        const ref = make(this.ctx.book, ch, vs, undefined, c[5] ? Number(c[5]) : undefined);
        if (!ref || (!c[2] && !this.ctx.verse)) break;
        push(c[1]);
        this.stats.context++;
        this.onContext?.(c[0].slice(c[1].length), toCompact(ref), c[1]);
        push(c[0].slice(c[1].length), toCompact(ref));
        pos += c[0].length;
      }
      last = pos;
      BARE_CV.lastIndex = pos;
    }
    push(text.slice(last));
  }
}

// ---------------------------------------------------------------------------------------------
// Markup pass: rewrites a TEI/ThML entry so that htmlToBlocks sees only resolved links.
//   <ref osisRef="Bible:Exod.6.20">Ex. 6:20</ref>  → <ref c="EXO.6.20">Ex. 6:20</ref>
//   <scripRef passage="nu 26:59">Numbers 26:59</scripRef> → <ref c="NUM.26.59">…</ref>
//   <ref target="Easton:MOSES">MOSES</ref>         → <ref h="/study/dictionary/easton/moses">…</ref>
//   <ref target="StrongsHebrew:433">H433</ref>     → <ref s="H433">…</ref>
//   prose refs                                      → <ref c="…">…</ref>
// The attribute names c/h/s are read back by the converters (dict-convert.ts).

export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

export interface LinkTarget {
  href?: string;
  s?: string;
}

export interface MarkupOptions {
  label?: string;
  /** Resolves a cross-entry target ("Easton:MOSES"); null to leave the text unlinked. */
  target?: (target: string, text: string) => LinkTarget | null;
  /** Resolves a ThML <term> (its text is the key of another entry); null to leave it unlinked. */
  term?: (text: string) => LinkTarget | null;
  /** Link bare chapter:verse refs through the context book (default true). */
  contextual?: boolean;
  /** Keep valid ref attributes that disagree with their text (ThML passages name their book). */
  trustAttr?: boolean;
  /** Tags whose start or end is a hard break for the reference context. */
  breaks?: RegExp;
  /** Statuses recorded in stats.samples. */
  sampleStatuses?: RefStatus[];
  /** Called for each bare ref linked through the context (for inspection). */
  onContext?: (text: string, ref: string, before: string) => void;
  /** The book the entry is about (see homeBook). */
  home?: BookCode | null;
  /** See RefLinker.longLeads (default true). */
  longLeads?: boolean;
}

type TagToken = { tag: string; closing: boolean; self: boolean; attrs: string; raw: string };
type Token = TagToken | { text: string };

function tokenize(markup: string): Token[] {
  const out: Token[] = [];
  for (const m of markup.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) out.push({ text: m[5] });
    else out.push({ tag: m[2].toLowerCase(), closing: m[1] === '/', self: m[4] === '/', attrs: m[3], raw: m[0] });
  }
  return out;
}

function attrValue(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs);
  return m ? decodeEntities(m[1]) : undefined;
}

/** Converts a ThML passage attribute ("nu 26:59", "ge 12:10-20") to a compact ref, or an error. */
export function passageToCompact(passage: string): AttrRef {
  const ref = parseRefWithBook(passage);
  return ref ? { ref: toCompact(ref) } : { error: `cannot read passage "${passage}"` };
}

const ORDINAL = /^(?:st|nd|rd|th)\b/;
// "Micah 2</ref>Ch 34:20": the digit belongs to a numbered book name in the following text.
const SPLIT_BOOK = /^([A-Z][a-z]{1,4}\.?\s*\d{1,3}(?:\s*:\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?)?)/;

const REF_TAGS = new Set(['ref', 'scripref', 'reference']);

/**
 * Rewrites one entry's markup: every tagged ref is resolved (see resolveTagged) or unwrapped, prose
 * refs are linked, and cross-entry targets become h/s links. Returns the markup and ref counts.
 */
export function linkMarkup(markup: string, opts: MarkupOptions = {}): { html: string; stats: RefStats } {
  const linker = new RefLinker(opts.label, opts.contextual ?? true, opts.trustAttr ?? false, opts.sampleStatuses, opts.onContext, opts.home ?? null, opts.longLeads ?? true);
  const tokens = tokenize(markup);
  const out: string[] = [];
  const breaks = opts.breaks ?? /^(p|lb|br|item|li|list|ol|ul|def|title|div|entryfree)$/;

  const emitProse = (text: string) => {
    for (const p of linker.prose(text)) {
      out.push(p.ref ? `<ref c="${p.ref}">${escapeText(p.t)}</ref>` : escapeText(p.t));
    }
  };
  const emitRef = (compact: string, text: string) => out.push(`<ref c="${compact}">${escapeText(text)}</ref>`);
  const emitLink = (target: LinkTarget | null, inner: string) => {
    if (target?.href) out.push(`<ref h="${escapeAttr(target.href)}">${escapeText(inner)}</ref>`);
    else if (target?.s) out.push(`<ref s="${escapeAttr(target.s)}">${escapeText(inner)}</ref>`);
    else emitProse(inner);
  };
  /** Index of the closing tag of the element opened at i, and its text. */
  const element = (i: number): { end: number; inner: string } => {
    const tag = (tokens[i] as TagToken).tag;
    let j = i + 1;
    let inner = '';
    while (j < tokens.length) {
      const t = tokens[j];
      if ('text' in t) inner += t.text;
      else if (t.tag === tag && t.closing) break;
      j++;
    }
    return { end: j, inner: decodeEntities(inner) };
  };
  const isRefOpen = (t: Token | undefined): t is TagToken => !!t && !('text' in t) && REF_TAGS.has(t.tag) && !t.closing && !t.self;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if ('text' in tok) {
      emitProse(decodeEntities(tok.text));
      continue;
    }
    const isRef = REF_TAGS.has(tok.tag);
    if (!(isRef || tok.tag === 'term') || tok.closing || tok.self) {
      if (breaks.test(tok.tag)) linker.breakLine();
      out.push(tok.raw);
      continue;
    }
    const { end, inner } = element(i);
    i = end;
    if (tok.tag === 'term') {
      emitLink(opts.term?.(inner) ?? null, inner);
      continue;
    }
    const target = attrValue(tok.attrs, 'target');
    if (target !== undefined) {
      emitLink(opts.target?.(target, inner) ?? null, inner);
      continue;
    }
    const osis = attrValue(tok.attrs, 'osisRef');
    const passage = attrValue(tok.attrs, 'passage');
    if (osis === undefined && passage === undefined) {
      emitProse(inner);
      continue;
    }
    let text = inner;
    const next = tokens[i + 1];
    const nextText = next && 'text' in next ? decodeEntities(next.text) : null;
    const consumeNext = (n: number) => {
      (tokens[i + 1] as { text: string }).text = escapeText(nextText!.slice(n));
    };

    // Boundary repairs. The rest of the ref follows the tag: "2Jo 1</ref>:6", "Judg. 8:33-9</ref>:6",
    // "Lu 18:35-4</ref>3". An ordinal: "2</ref>nd". A numbered book: "Micah 2</ref>Ch 34:20",
    // "Titus 2</ref><ref>Co 8:16</ref>".
    if (nextText !== null) {
      const tail = /^(?::\d{1,3}(?:\s?[-–]\s?\d{1,3})?|\d+)/.exec(nextText);
      const joined = tail ? `${text}${tail[0]}` : '';
      if (tail && /\d$/.test(text) && readRefText(joined, linker.ctx, linker.sep).refs.length) {
        text = joined;
        consumeNext(tail[0].length);
        linker.stats.repaired++;
      } else if (/^\d{1,3}$/.test(text.trim()) && ORDINAL.test(nextText)) {
        linker.stats.dropped++;
        linker.sep += text;
        out.push(escapeText(text));
        continue;
      }
    }
    const split = /(^|\s)([1-3])$/.exec(text);
    if (split) {
      const fromText = nextText !== null ? SPLIT_BOOK.exec(nextText) : null;
      const nextRef = isRefOpen(next) ? element(i + 1) : null;
      const fromRef = nextRef && SPLIT_BOOK.test(nextRef.inner) ? nextRef : null;
      const rest = fromText?.[1] ?? fromRef?.inner;
      const combined = rest ? parseRefWithBook(`${split[2]}${rest}`) : null;
      if (combined) {
        linker.stats.repaired++;
        emitProse(text.slice(0, text.length - 1));
        if (fromText) {
          emitRef(toCompact(combined), `${split[2]}${fromText[1]}`);
          linker.setRef(toCompact(combined));
          consumeNext(fromText[1].length);
        } else {
          // Prefix the digit to the next ref's text; that ref is then resolved from its text.
          const textTok = tokens.slice(i + 2, fromRef!.end).find((t): t is { text: string } => 'text' in t);
          if (textTok) textTok.text = `${split[2]}${textTok.text}`;
        }
        continue;
      }
    }

    // "2sa 15;24,29" with text "2 Samuel 15;24,29": a semicolon typed for the colon, in both.
    if (passage !== undefined && /^[^:]*\d;\d/.test(passage)) text = text.replace(/(\d);(\d)/, '$1:$2');
    // One tagged element holding a list: "33:47,48", "Genesis 45:19,27", "1 Macc. 1:23; 4:49".
    const parts = /[,;]/.test(cleanRefText(text)) ? splitRefList(text) : [text];
    const attrs: AttrRef[] = passage !== undefined
      ? expandPassage(passage)
      : [osisRefToCompact(osis!)];
    let unknown = false;
    for (let p = 0; p < parts.length; p++) {
      if (p % 2) {
        emitProse(parts[p]);
        continue;
      }
      const part = parts[p];
      if (unknown) {
        // Continuations of a book outside the 66.
        linker.stats.dropped++;
        linker.sep += part;
        out.push(escapeText(part));
        continue;
      }
      const k = p / 2;
      const a: AttrRef = attrs.length === (parts.length + 1) / 2 ? attrs[k] : k === 0 ? attrs[0] : { error: 'list continuation' };
      const r = linker.tagged(a, part);
      if (r.unknownBook) unknown = true;
      if (r.ref) emitRef(r.ref, part);
      else out.push(escapeText(part));
    }
  }
  return { html: out.join(''), stats: linker.stats };
}
