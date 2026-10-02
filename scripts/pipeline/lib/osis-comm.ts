// Helpers for converting SWORD commentary entries (OSIS: MHC, JFB; ThML: Barnes) into the app's
// rich text: splitting entries at their own verse headers, verse ranges from verse markers,
// ThML scripture-reference parsing, and markup preparation for htmlToBlocks.
import { type BookCode, bookInfo } from '../../../src/lib/bible/books';
import { parseBookName, type Ref, toCompact } from '../../../src/lib/bible/refs';
import { verseCount } from '../../../src/lib/bible/versification';
import type { Block, Inline } from '../../../src/lib/data/types';
import { compactValid, osisRefToCompact } from './osis-refs';
import { decodeEntities, htmlToBlocks, normalizeInlines } from './richtext';

export interface Piece {
  /** Verse range from a header in the text, or null when the piece has no header. */
  head: [number, number] | null;
  html: string;
  /** Offset of the piece in the entry. */
  offset: number;
}

function rangeOf(a: string, b: string | undefined): [number, number] {
  const s = Number(a);
  const e = b ? Number(b) : s;
  return [s, Math.max(s, e)];
}

/** Splits `html` at the given header positions; text before the first header is a headless piece. */
function splitAt(html: string, heads: { index: number; head: [number, number] }[]): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  let head: [number, number] | null = null;
  for (const h of heads) {
    if (h.index > last || head) out.push({ head, html: html.slice(last, h.index), offset: last });
    last = h.index;
    head = h.head;
  }
  out.push({ head, html: html.slice(last), offset: last });
  return out.filter((p) => p.head || p.html.replace(/<[^>]*>/g, '').trim());
}

/**
 * True when position `i` of an OSIS entry starts a paragraph: only whitespace and milestones lie
 * between it and the start of the entry or an x-p paragraph milestone.
 */
function atParagraphStart(html: string, i: number): boolean {
  const before = html.slice(0, i);
  const tail = /(?:\s|<[^>]*\/>)*$/.exec(before)![0];
  return tail.length === before.length || /type="x-p"/.test(tail);
}

/**
 * JFB: each comment starts a paragraph with a bold verse header, `<hi type="bold">16. For God so
 * loved, &amp;c.--</hi>` or `14-16.`. Splits an entry at those headers.
 */
export function splitJfb(osis: string, plainFirst = false): Piece[] {
  const heads: { index: number; head: [number, number] }[] = [];
  for (const m of osis.matchAll(/<hi type="bold">\s*(\d+)(?:\s*[-–,]\s*(\d+))?\s*\./g)) {
    if (atParagraphStart(osis, m.index)) heads.push({ index: m.index, head: rangeOf(m[1], m[2]) });
  }
  if (!heads.length && plainFirst) {
    // A few comments have the verse number as plain text: "24. This incident …".
    const m = /^((?:\s|<[^>]*\/>)*)(\d+)(?:\s*[-–,]\s*(\d+))?\.\s/.exec(osis);
    if (m) heads.push({ index: m[1].length, head: rangeOf(m[2], m[3]) });
  }
  return splitAt(osis, heads);
}

/**
 * MHC sections quote the passage with superscript verse numbers (`<hi type="super">7</hi>`, or an
 * empty superscript followed by "—3"). Returns the range from the first to the highest marker.
 */
export function mhcMarkerRange(osis: string): [number, number] | null {
  const nums: number[] = [];
  for (const m of osis.matchAll(/<hi type="super">\s*(\d*)\s*<\/hi>\s*(?:—\s*(\d+))?/g)) {
    const n = m[1] ? Number(m[1]) : m[2] ? Number(m[2]) : NaN;
    if (Number.isFinite(n)) nums.push(n);
  }
  if (!nums.length) return null;
  return [nums[0], Math.max(...nums)];
}

/**
 * Barnes: comments start a paragraph with "Verse 16." / "Verses 2-16." / "Verse 5:" (sometimes
 * after the book name, "Matthew Verses 2-16"). `firstVerse` also accepts a plain "1." paragraph,
 * which Barnes uses for Matt 1:1 after the gospel title.
 */
export function splitBarnes(thml: string, firstVerse = false): Piece[] {
  const heads: { index: number; head: [number, number] }[] = [];
  const re = /(^|<br\s*\/>)((?:\s|<br\s*\/>)*)((?:[1-3]?\s?[A-Z][a-z]+\s+)?)Verses?\s+(\d+)(?:\s*[-–,]\s*(\d+))?\s*(?:[.:]|(?=\s))/g;
  for (const m of thml.matchAll(re)) {
    if (m[3] && !parseBookName(m[3].trim())) continue;
    heads.push({ index: m.index + m[1].length + m[2].length, head: rangeOf(m[4], m[5]) });
  }
  if (!heads.length && firstVerse) {
    const m = /<br\s*\/>\s*1\.\s+(?=[A-Z])/.exec(thml);
    if (m) heads.push({ index: m.index + m[0].indexOf('1.'), head: [1, 1] });
  }
  return splitAt(thml, heads);
}

// ---------------------------------------------------------------------------------------------
// ThML scripture references: <scripRef passage="Jn 6:33, 17:21">Jn 6:33, 17:21</scripRef>

/** Misspellings found in Barnes' passage attributes. */
const BOOK_FIXES: Record<string, BookCode> = {
  he: 'HEB', ep: 'EPH', mi: 'MIC', phi: 'PHP', ph: 'PHP', lkke: 'LUK', actst: 'ACT', actsts: 'ACT', provo: 'PRO',
  hen: 'HEB', co: 'COL',
};

/**
 * Resolves a ThML book abbreviation. Barnes writes Judges as "Jud" (and Jude as "Jude"), except in
 * his notes on Jude itself.
 */
export function thmlBook(raw: string, current?: BookCode): BookCode | null {
  const name = raw.trim();
  if (/^jud$/i.test(name)) return current === 'JUD' ? 'JUD' : 'JDG';
  const direct = parseBookName(name);
  if (direct) return direct;
  const key = name.toLowerCase().replace(/\s+/g, '');
  if (BOOK_FIXES[key]) return BOOK_FIXES[key];
  // Doubled letters: "1Timm", "Gall", "Romm", "Revv", "Nehh".
  const undoubled = name.replace(/([a-z])\1+/gi, '$1');
  return undoubled !== name ? parseBookName(undoubled) : null;
}

export interface PassageItem {
  ref: string;
  /** Character span of the item in the parsed string. */
  start: number;
  end: number;
}

/**
 * Parses a ThML passage list such as "Jn 6:33, 17:21", "Ps 132:10,11", "Mt 4", "De 22:23, 24",
 * "Acts 24:1-25:27", or a bare "1:14,18" / "15", resolving missing books and chapters from the
 * previous item or from `ctx` (the passage being commented on).
 */
export function parseThmlPassage(passage: string, ctx: { book: BookCode; chapter: number }): { items: PassageItem[]; errors: string[] } {
  const items: PassageItem[] = [];
  const errors: string[] = [];
  let book = ctx.book;
  let chapter = ctx.chapter;
  const re = /[^;,]+/g;
  for (const m of passage.matchAll(re)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) continue;
    const start = m.index + lead;
    const end = start + text.length;
    const mm = /^((?:[1-3]|I{1,3})?\s?[A-Za-z][A-Za-z.]*?\.?)?\s*(\d+)(?:\s*[:.]\s*(\d+))?(?:\s*[-–]\s*(\d+)(?:\s*[:.]\s*(\d+))?)?\s*(?:ff?\.?)?$/.exec(text);
    if (!mm) {
      errors.push(text);
      continue;
    }
    let hasBook = false;
    if (mm[1]) {
      const b = thmlBook(mm[1].replace(/\.$/, ''), ctx.book);
      if (!b) {
        errors.push(text);
        continue;
      }
      book = b;
      hasBook = true;
    }
    const n1 = Number(mm[2]);
    const single = bookInfo(book).chapters === 1;
    let ref: Ref;
    if (mm[3] !== undefined) {
      chapter = n1;
      ref = { book, chapter, verse: Number(mm[3]) };
      if (mm[5] !== undefined) {
        ref.endChapter = Number(mm[4]);
        ref.endVerse = Number(mm[5]);
      } else if (mm[4] !== undefined) ref.endVerse = Number(mm[4]);
    } else if (hasBook && !single) {
      chapter = n1;
      ref = { book, chapter };
    } else {
      if (single) chapter = 1;
      ref = { book, chapter, verse: n1 };
      if (mm[4] !== undefined) ref.endVerse = Number(mm[4]);
    }
    const ok = validRef(ref);
    if (!ok) {
      errors.push(text);
      continue;
    }
    items.push({ ref: toCompact(ok), start, end });
  }
  return { items, errors };
}

function validRef(ref: Ref): Ref | null {
  const info = bookInfo(ref.book);
  if (ref.chapter < 1 || ref.chapter > info.chapters) return null;
  if (ref.verse === undefined) return ref;
  if (ref.verse < 1 || ref.verse > verseCount(ref.book, ref.chapter)) return null;
  if (ref.endChapter !== undefined) {
    if (ref.endChapter === ref.chapter) delete ref.endChapter;
    else if (ref.endChapter < ref.chapter || ref.endChapter > info.chapters) return null;
  }
  const endCh = ref.endChapter ?? ref.chapter;
  if (ref.endVerse !== undefined) {
    if (ref.endVerse < 1 || ref.endVerse > verseCount(ref.book, endCh)) return null;
    if (ref.endChapter === undefined && ref.endVerse < ref.verse) return null;
    if (ref.endChapter === undefined && ref.endVerse === ref.verse) delete ref.endVerse;
  }
  return ref;
}

export interface RefStats {
  links: number;
  failed: string[];
}

/**
 * Rewrites ThML <scripRef> elements so each carries one compact ref in `data-ref`. A list such as
 * "Jn 6:33, 17:21" becomes one link per reference when the element text spells out the same
 * references as its passage attribute; otherwise the whole text links to the first reference.
 */
export function prepareScripRefs(thml: string, ctx: { book: BookCode; chapter: number }, stats: RefStats): string {
  return thml.replace(/<scripRef\b([^>]*)>([\s\S]*?)<\/scripRef>/g, (all, attrs: string, inner: string) => {
    const passage = decodeEntities(/passage="([^"]*)"/.exec(attrs)?.[1] ?? inner.replace(/<[^>]*>/g, ''));
    const p = parseThmlPassage(passage, ctx);
    if (!p.items.length) {
      stats.failed.push(passage);
      return inner;
    }
    if (p.errors.length) stats.failed.push(...p.errors);
    const plain = inner.includes('<') ? null : inner;
    if (plain !== null && p.items.length > 1) {
      const t = parseThmlPassage(decodeEntities(plain), { book: ctx.book, chapter: ctx.chapter });
      if (t.items.length === p.items.length && t.items.every((x, i) => x.ref === p.items[i].ref) && plain === decodeEntities(plain)) {
        let out = '';
        let last = 0;
        for (const it of t.items) {
          out += plain.slice(last, it.start) + `<scripRef data-ref="${it.ref}">${plain.slice(it.start, it.end)}</scripRef>`;
          last = it.end;
        }
        stats.links += t.items.length;
        return out + plain.slice(last);
      }
    }
    stats.links++;
    return `<scripRef data-ref="${p.items[0].ref}">${inner}</scripRef>`;
  });
}

// ---------------------------------------------------------------------------------------------
// OSIS commentary markup → the HTML-like input of htmlToBlocks

/**
 * Prepares OSIS commentary text for htmlToBlocks: paragraph and poetry milestones become line
 * breaks (htmlToBlocks ignores self-closing divs), small-caps text is upper-cased ("LORD"), and
 * structural milestones are removed.
 */
export function prepareOsis(osis: string): string {
  return splitMultiRefs(osis)
    .replace(/<div\b[^>]*type="x-p"[^>]*\/>/g, '<lb/>')
    .replace(/<(?:lg|l)\b[^>]*\/>/g, '<lb/>')
    .replace(/<hi type="small-caps">([^<]*)<\/hi>/g, (_, t: string) => t.toUpperCase())
    .replace(/<(?:chapter|milestone|div)\b[^>]*\/>/g, '');
}

/**
 * Splits `<reference osisRef="Gen.49.5 Gen.49.7">Ge 49:5, 7</reference>` into one element per
 * reference when the text lists the same number of parts; otherwise keeps the first reference.
 */
export function splitMultiRefs(osis: string): string {
  return osis.replace(/<reference\b([^>]*)\bosisRef="([^"]*\s[^"]*)"([^>]*)>([^<]*)<\/reference>/g, (all, pre: string, list: string, post: string, text: string) => {
    const refs = list.trim().split(/\s+/);
    const parts = text.split(/([,;]\s*)/);
    const items = parts.filter((_, i) => i % 2 === 0);
    if (items.length === refs.length && items.every((x) => x.trim())) {
      return parts.map((p, i) => (i % 2 ? p : `<reference${pre}osisRef="${refs[i / 2]}"${post}>${p}</reference>`)).join('');
    }
    return `<reference${pre}osisRef="${refs[0]}"${post}>${text}</reference>`;
  });
}

/**
 * Converts prepared commentary markup to blocks. OSIS osisRef and prepared ThML data-ref become
 * `ref` links; links (including ones found in prose) that are not valid in the KJV versification
 * are removed again and counted as failed.
 */
export function commentaryBlocks(html: string, stats: RefStats): Block[] {
  const blocks = htmlToBlocks(html, {
    refAttr: (a) => {
      if (a['data-ref']) return a['data-ref'];
      if (a.osisref) {
        const r = osisRefToCompact(a.osisref);
        if ('ref' in r) {
          stats.links++;
          return r.ref;
        }
        stats.failed.push(a.osisref);
      }
      return null;
    },
  });
  for (const b of blocks) {
    let changed = false;
    const c = b.c.map((x) => {
      if (typeof x === 'string' || !x.ref || compactValid(x.ref)) return x;
      stats.failed.push(x.ref);
      changed = true;
      const rest: Exclude<Inline, string> = { ...x };
      delete rest.ref;
      return Object.keys(rest).length > 1 ? rest : rest.t;
    });
    if (changed) b.c = normalizeInlines(c);
  }
  return blocks;
}
