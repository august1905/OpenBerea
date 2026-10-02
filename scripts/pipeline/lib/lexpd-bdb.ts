// Brown-Driver-Briggs (Bible Aquifer CC0 edition, BibleAquifer/BDBHebrewLexicon + BDBAramaicLexicon)
// → LexiconEntry blocks keyed by Strong's number.
//
// Source shape: each Aquifer article is one BDB root section as HTML. A paragraph <p class="p"> is one
// BDB entry. The main word is a top-level paragraph, derived words follow in <blockquote>s, and
// paragraphs from BDB's Addenda follow the entry they amend, behind a <p class="addenda"> marker. An
// entry that has a Strong's number begins with "[Str 430]" (or "[Str 6, 8]", "[Str 168–69]"). Scripture
// refs are <data class="bible-ref" data-start-ref="BBCCCVVV"> in Hebrew verse numbering, internal
// cross-references are <data class="resource-ref" data-content-id="BDB00018">, and Hebrew/Greek words
// are <span class="hebrew"> / <span class="greek">.

import type { Block, Inline } from '../../../src/lib/data/types';
import { decodeEntities, normalizeInlines, tagScripts } from './richtext';

export interface AquiferArticle {
  content_id: string;
  title: string;
  content: string;
}

/** Highest number in Strong's Hebrew dictionary. */
export const MAX_STRONG_HEBREW = 8674;

// ---------------------------------------------------------------------------------------------
// Strong's markers

export interface StrongSpec {
  nums: number[];
  /** Parts of the marker that were not a plain number or short range (logged by the stage). */
  irregular: string[];
}

/**
 * Expands a marker's numbers: "6, 8", "168–69" (abbreviated end), "866,868–69", "3588+5921+3651",
 * "3068,3097, etc". A trailing "l" is a misread "1" ("187l" = 1871). Reversed ranges are skipped and
 * wide ranges keep only their ends; both are reported as irregular. Numbers outside 1–8674 are dropped.
 */
export function expandStrongs(spec: string): StrongSpec {
  const nums: number[] = [];
  const irregular: string[] = [];
  const push = (n: number) => {
    if (n < 1 || n > MAX_STRONG_HEBREW) irregular.push(String(n));
    else if (!nums.includes(n)) nums.push(n);
  };
  for (const raw of spec.split(/[,+]/)) {
    const part = raw.trim().replace(/^(\d+)l$/, (_, d: string) => `${d}1`);
    if (!part || /^etc\.?$/.test(part)) continue;
    if (/^\d+$/.test(part)) {
      push(Number(part));
      continue;
    }
    const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(part);
    if (range) {
      const a = range[1];
      let b = range[2];
      if (b.length < a.length) b = a.slice(0, a.length - b.length) + b;
      const lo = Number(a);
      const hi = Number(b);
      if (hi < lo) {
        irregular.push(part);
      } else if (hi - lo > 12) {
        irregular.push(part);
        push(lo);
        push(hi);
      } else {
        for (let n = lo; n <= hi; n++) push(n);
      }
      continue;
    }
    irregular.push(part);
    for (const d of part.match(/\d+/g) ?? []) push(Number(d));
  }
  return { nums, irregular };
}

// ---------------------------------------------------------------------------------------------
// Articles → entries

export interface BdbEntry {
  article: string;
  /** Marker text as printed, e.g. "6, 8". */
  spec: string;
  nums: number[];
  /** Paragraph HTML: the entry (marker removed), then any Addenda paragraphs. */
  paras: string[];
}

export interface ParsedArticle {
  entries: BdbEntry[];
  /** Paragraphs without a Strong's number: roots, cross-reference stubs, words Strong does not list. */
  unkeyed: number;
  /** Addenda paragraphs that follow an unkeyed paragraph. */
  orphanAddenda: number;
  irregular: string[];
}

// A stray page number may precede the marker ("188<abbr>[Str 1740]…" in BDB02065); it is dropped.
const MARKER = /^\s*\d*\s*<abbr>\[Str<span class="strongs-number">([^<]*)<\/span>\]<\/abbr>\s*/;

/**
 * Removes the per-article <style> block and repairs the digitization's few malformed spots: tags with a
 * dot in their name ("<esp. as=…>"), an entry left outside any paragraph after "</p>" (BDB01310,
 * [Str 2998]), and a paragraph left open at "</blockquote>".
 */
export function normalizeArticleHtml(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<\/?[a-zA-Z]+\.[^>]*>/g, '')
    .replace(/<\/p>(\s*)(<abbr>\[Str)/g, '</p>$1<p class="p">$2')
    .replace(/(<p class="p">(?:(?!<\/p>|<\/blockquote>|<p class="p">)[\s\S])*?)<\/blockquote>/g, '$1</p></blockquote>');
}

export function parseArticle(a: AquiferArticle): ParsedArticle {
  const html = normalizeArticleHtml(a.content);
  const out: ParsedArticle = { entries: [], unkeyed: 0, orphanAddenda: 0, irregular: [] };
  let current: BdbEntry | null = null;
  let currentQuote = -1;
  let quote = -1;
  let quotes = 0;
  let addenda = false;
  const re = /<blockquote>|<\/blockquote>|<p class="addenda">|<p class="p">([\s\S]*?)<\/p>/g;
  for (const m of html.matchAll(re)) {
    const tok = m[0];
    if (tok === '<blockquote>') {
      quote = quotes++;
      continue;
    }
    if (tok === '</blockquote>') {
      quote = -1;
      continue;
    }
    if (tok === '<p class="addenda">') {
      addenda = true;
      continue;
    }
    const body = m[1];
    const marker = MARKER.exec(body);
    if (marker) {
      const spec = expandStrongs(marker[1]);
      for (const p of spec.irregular) out.irregular.push(`${a.content_id} [Str ${marker[1]}]: ${p}`);
      if (spec.nums.length) {
        current = { article: a.content_id, spec: marker[1], nums: spec.nums, paras: [body.slice(marker[0].length)] };
        currentQuote = quote;
        out.entries.push(current);
      } else {
        out.unkeyed++;
        current = null;
      }
    } else if (current && (addenda || (quote >= 0 && quote === currentQuote))) {
      current.paras.push(body);
    } else {
      if (addenda) out.orphanAddenda++;
      else out.unkeyed++;
      current = null;
    }
    addenda = false;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Hebrew helpers

export function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/** Texts of the <span class="hebrew"> elements, in order. */
export function hebrewSpans(html: string, limit = Infinity): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<span class="hebrew">([\s\S]*?)<\/span>/g)) {
    const t = plainText(m[1]);
    if (t) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** Headword: the first Hebrew word of the entry. */
export function headword(entry: BdbEntry): string {
  return hebrewSpans(entry.paras[0], 1)[0] ?? '';
}

/** A cross-reference stub such as "[אָב] v. אבה. below" or "אֲבִגַיִל v. אֲבִיגַיִל sub II. אבה". */
export function isStub(entry: BdbEntry): boolean {
  const text = plainText(entry.paras[0]);
  return text.length < 120 && /(^|[\s\]])v\.\s/.test(text) && !/\d+:\d+/.test(text);
}

const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/** Consonants only, final forms normalized: "אֱלֹהִים" → "אלהימ". */
export function skeleton(s: string): string {
  return s
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^\u05D0-\u05EA]/g, '');
}

/** Skeleton without the vowel letters ו י א ה, so plene and defective spellings compare equal. */
export function looseSkeleton(s: string): string {
  return skeleton(s).replace(/[ויאה]/g, '');
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/** Number of leading Hebrew words that count as an entry's headword forms. */
export const HEAD_WORDS = 3;
/** Number of leading Hebrew words searched for weak evidence. */
export const NEAR_WORDS = 8;

function strongMatch(w: string, lemma: string): boolean {
  const a = skeleton(w);
  const b = skeleton(lemma);
  if (!a || !b) return false;
  const la = looseSkeleton(w);
  const lb = looseSkeleton(lemma);
  if (a === b || (la.length >= 2 && la === lb)) return true;
  if ((b.length >= 3 && a.includes(b)) || (a.length >= 3 && b.includes(a))) return true;
  return Math.min(la.length, lb.length) >= 3 && editDistance(la, lb) <= 1;
}

function weakMatch(w: string, lemma: string): boolean {
  const a = skeleton(w);
  const b = skeleton(lemma);
  if (!a || !b) return false;
  const la = looseSkeleton(w);
  const lb = looseSkeleton(lemma);
  return (
    strongMatch(w, lemma) ||
    (Math.min(a.length, b.length) >= 2 && editDistance(a, b) <= 1) ||
    (Math.min(la.length, lb.length) >= 2 && editDistance(la, lb) <= 1)
  );
}

/** Strong's lemmas as single forms: TBESH writes some as "נֹף, מֹף". */
export function lemmaForms(lemmas: string[]): string[] {
  return lemmas.flatMap((l) => l.split(/\s*,\s*/)).filter(Boolean);
}

/**
 * How well an entry's Hebrew words support a Strong's marker.
 * strong: one of the first three words has the lemma's consonants, the same apart from the vowel
 *   letters ו י א ה, one letter apart (three or more consonants), or contains it / is contained in it
 *   (compound names such as בֵּית הָרָם listed under הָרָם).
 * weak: one of the first eight words matches that way, or is one letter apart even when short.
 */
export function keyEvidence(words: string[], lemmas: string[]): 'strong' | 'weak' | null {
  const forms = lemmaForms(lemmas);
  const head = words.slice(0, HEAD_WORDS);
  if (head.some((w) => forms.some((l) => strongMatch(w, l)))) return 'strong';
  const near = words.slice(0, NEAR_WORDS);
  if (near.some((w) => forms.some((l) => weakMatch(w, l)))) return 'weak';
  return null;
}

/** True when any of the words matches a lemma form (strong or weak): used for whole-entry searches. */
export function mentionsLemma(words: string[], lemmas: string[]): boolean {
  const forms = lemmaForms(lemmas);
  return words.some((w) => forms.some((l) => weakMatch(w, l)));
}

/** Strong's id for an internal cross-reference: the one entry of the target article with that headword. */
export function resolveCrossRef(targets: { head: string; nums: number[] }[] | undefined, text: string): string | null {
  const k = skeleton(text);
  if (!k || !targets) return null;
  const hits = targets.filter((t) => skeleton(t.head) === k);
  return hits.length === 1 && hits[0].nums.length === 1 ? `H${hits[0].nums[0]}` : null;
}

// ---------------------------------------------------------------------------------------------
// HTML → blocks

export interface InlineContext {
  /** Compact KJV ref for a bible-ref element, or null to leave its text unlinked. */
  bibleRef(start: string, end: string, text: string): string | null;
  /** Compact KJV ref for a <span class="ref" data-ref="Is 28">, or null. */
  chapterRef(dataRef: string, text: string): string | null;
  /** Strong's id for a resource-ref (internal cross-reference), or null. */
  crossRef(contentId: string, text: string): string | null;
  /** Called at the start of each paragraph. */
  beginParagraph?(): void;
}

// Bold labels that open a new block: sense numbers ("1.", "II.") and verb stems ("Qal", "Niph.").
const SPLIT_BOLD =
  /^(?:\d{1,2}\.|[IVX]{1,4}\.)(?:\s|$)|^(?:Qal|Niph|Pi|Pu|Hiph|Hoph|Hith\w*|Pilp\w*|Pilel|Pol\w*|Pul\w*|Po|Pe|Pa|Peil|Pe‘îl|Haph\w*|Aph\w*|Ithp\w*|Hisht\w*|Shaph\w*|Tiph\w*|Hoth\w*|Nithp\w*)\b/;

type Marks = { i?: 1; b?: 1; sup?: 1 };

function trimInlines(inlines: Inline[]): Inline[] {
  const c = normalizeInlines(inlines);
  if (!c.length) return c;
  const fix = (p: Inline, f: (s: string) => string): Inline => (typeof p === 'string' ? f(p) : { ...p, t: f(p.t) });
  c[0] = fix(c[0], (s) => s.trimStart());
  c[c.length - 1] = fix(c[c.length - 1], (s) => s.trimEnd());
  return c.filter((p) => (typeof p === 'string' ? p.length : p.t.length));
}

function hasText(inlines: Inline[]): boolean {
  return inlines.some((p) => (typeof p === 'string' ? p.trim() : p.t.trim()));
}

/**
 * Converts one Aquifer paragraph to blocks. With `split`, a new block starts before each bold sense
 * number or stem name, so long verb entries read as a sequence of paragraphs.
 */
export function paragraphBlocks(html: string, ctx: InlineContext, split = true): Block[] {
  ctx.beginParagraph?.();
  const blocks: Block[] = [];
  let cur: Inline[] = [];
  const flush = () => {
    const c = trimInlines(cur);
    if (c.length) blocks.push({ k: 'p', c });
    cur = [];
  };
  const depth = { i: 0, b: 0, sup: 0 };
  const spans: string[] = [];
  const marks = (): Marks => {
    const m: Marks = {};
    if (depth.i > 0) m.i = 1;
    if (depth.b > 0) m.b = 1;
    if (depth.sup > 0) m.sup = 1;
    return m;
  };
  const lang = (): 'hbo' | 'grc' | undefined => {
    for (let k = spans.length - 1; k >= 0; k--) {
      if (spans[k] === 'hebrew') return 'hbo';
      if (spans[k] === 'greek') return 'grc';
    }
    return undefined;
  };
  const emitText = (text: string, extra: { ref?: string; s?: string } = {}, forceLang?: 'hbo' | 'grc') => {
    if (!text) return;
    const m = { ...marks(), ...extra };
    const l = forceLang ?? lang();
    if (l) {
      cur.push({ t: text, l, ...m });
      return;
    }
    if (extra.ref || extra.s) {
      cur.push({ t: text, ...m });
      return;
    }
    for (const piece of tagScripts(text)) {
      if (typeof piece === 'string') cur.push(Object.keys(m).length ? { t: piece, ...m } : piece);
      else cur.push({ ...m, ...piece });
    }
  };

  const re =
    /<data class="bible-ref" data-start-ref="(\d{8})" data-end-ref="(\d{8})">([\s\S]*?)<\/data>|<data class="resource-ref" data-content-id="([^"]*)"[^>]*>([\s\S]*?)<\/data>|<span class="ref" data-ref="([^"]*)">([\s\S]*?)<\/span>|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      const text = plainText(m[3]);
      const ref = ctx.bibleRef(m[1], m[2], text);
      emitText(text, ref ? { ref } : {});
      continue;
    }
    if (m[4] !== undefined) {
      const text = plainText(m[5]);
      const s = ctx.crossRef(m[4], text);
      const isHebrew = /[\u05D0-\u05EA]/.test(text);
      emitText(text, s ? { s } : {}, isHebrew ? 'hbo' : undefined);
      continue;
    }
    if (m[6] !== undefined) {
      const text = plainText(m[7]);
      const ref = ctx.chapterRef(m[6], text);
      emitText(text, ref ? { ref } : {});
      continue;
    }
    if (m[11] !== undefined) {
      emitText(decodeEntities(m[11]));
      continue;
    }
    const closing = m[8] === '/';
    const tag = m[9].toLowerCase();
    if (tag === 'i' || tag === 'em') depth.i += closing ? -1 : 1;
    else if (tag === 'b' || tag === 'strong') {
      if (!closing && split && hasText(cur)) {
        const start = (m.index ?? 0) + m[0].length;
        const end = html.indexOf('</b>', start);
        if (end > 0 && SPLIT_BOLD.test(plainText(html.slice(start, end)))) flush();
      }
      depth.b += closing ? -1 : 1;
    } else if (tag === 'sup') depth.sup += closing ? -1 : 1;
    else if (tag === 'span') {
      if (closing) spans.pop();
      else spans.push(/class="([^"]*)"/.exec(m[10])?.[1] ?? '');
    }
    // abbr, a, p and other tags are transparent.
  }
  flush();
  return blocks;
}

/** Heading block for one BDB entry: its headword, plus all its Strong's numbers when it has several. */
export function headingBlock(head: string, nums: number[]): Block {
  const c: Inline[] = [head ? { t: head, l: 'hbo' } : 'BDB'];
  if (nums.length > 1) {
    c.push(' (Strong’s ');
    nums.forEach((n, i) => {
      if (i) c.push(', ');
      c.push({ t: `H${n}`, s: `H${n}` });
    });
    c.push(')');
  }
  return { k: 'h', c };
}

export interface RefCode {
  book: number;
  chapter: number;
  verse: number;
}

/** "26021035" → book 26, chapter 21, verse 35. */
export function parseRefCode(code: string): RefCode {
  return { book: Number(code.slice(0, 2)), chapter: Number(code.slice(2, 5)), verse: Number(code.slice(5, 8)) };
}

export interface CitedVerse {
  /** hebrew: BDB's own (Masoretic) numbering, to be mapped to KJV; kjv: already KJV numbers. */
  numbering: 'hebrew' | 'kjv';
  /** How the numbers were found, for the stage's counts. */
  basis: 'display' | 'code' | 'code-kjv';
  chapter: number;
  verse: number;
  endChapter?: number;
  endVerse?: number;
}

/**
 * Chapter and verse of a bible-ref. The printed text ("Ez 21:35", "Psalm 51:12") is BDB's Hebrew
 * numbering and is used whenever it has chapter:verse. The data-start-ref code is not consistent: the
 * digitization's ref attributes sometimes already hold the English number (display "21:35",
 * code 26021030 = Ez 21:30). For a bare verse ("15", "v:11") the code decides: when its verse equals the
 * printed verse the code is Hebrew numbering, otherwise it was already converted to KJV numbering.
 */
export function citedVerse(start: string, end: string, display: string): CitedVerse {
  const s = parseRefCode(start);
  const e = parseRefCode(end);
  const t = display.trim();
  const full = /(\d+):(\d+)[a-c]?(?:\s*[-–]\s*(?:(\d+):)?(\d+)[a-c]?)?$/.exec(t);
  if (full) {
    const out: CitedVerse = { numbering: 'hebrew', basis: 'display', chapter: Number(full[1]), verse: Number(full[2]) };
    if (full[4]) {
      out.endChapter = full[3] ? Number(full[3]) : out.chapter;
      out.endVerse = Number(full[4]);
    }
    return out;
  }
  const codeEnd = (out: CitedVerse): CitedVerse => {
    if (end !== start && e.book === s.book) {
      out.endChapter = e.chapter;
      out.endVerse = e.verse;
    }
    return out;
  };
  const bare = /(?:^|[^\d:])(\d+)[a-c]?(?:\s*[-–]\s*(\d+)[a-c]?)?$/.exec(t);
  if (bare && Number(bare[1]) !== s.verse) {
    return codeEnd({ numbering: 'kjv', basis: 'code-kjv', chapter: s.chapter, verse: s.verse });
  }
  const out = codeEnd({ numbering: 'hebrew', basis: 'code', chapter: s.chapter, verse: s.verse });
  if (bare?.[2]) {
    out.endChapter = s.chapter;
    out.endVerse = Number(bare[2]);
  }
  return out;
}

/** Joel is "Jo" in BDB; the digitization coded some of these refs (and their continuations) as John. */
export function isMiscodedJoel(bookNumber: number, text: string, previousWasJoel: boolean): boolean {
  if (bookNumber !== 43) return false;
  if (/^Jo\s/.test(text)) return true;
  return /^\d/.test(text) && previousWasJoel;
}

/** "Is 28", "1Sa 9:3", "Ps 80:17": book abbreviation, chapter and optional verse of a <span class="ref">. */
export function parseDataRef(dataRef: string): { abbr: string; chapter: number; verse?: number } | null {
  const m = /^([1-3]?[A-Za-z]+)\s+(\d+)(?::(\d+))?$/.exec(dataRef.trim());
  if (!m) return null;
  return { abbr: m[1], chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : undefined };
}

/** Book abbreviations used in the digitization's ref attributes (apocrypha such as 1Ma, Jud are absent). */
export const DATA_REF_BOOKS: Record<string, string> = {
  Ge: 'GEN', Ex: 'EXO', Le: 'LEV', Nu: 'NUM', De: 'DEU', Jos: 'JOS', Jdg: 'JDG', Ru: 'RUT', '1Sa': '1SA',
  '2Sa': '2SA', '1Ki': '1KI', '2Ki': '2KI', '1Ch': '1CH', '2Ch': '2CH', Ezr: 'EZR', Ne: 'NEH', Es: 'EST',
  Job: 'JOB', Ps: 'PSA', Pr: 'PRO', Ec: 'ECC', So: 'SNG', Is: 'ISA', Je: 'JER', La: 'LAM', Eze: 'EZK',
  Da: 'DAN', Ho: 'HOS', Joe: 'JOL', Am: 'AMO', Ob: 'OBA', Jon: 'JON', Mic: 'MIC', Na: 'NAM', Hab: 'HAB',
  Zep: 'ZEP', Hag: 'HAG', Zec: 'ZEC', Mal: 'MAL', Mt: 'MAT', Mk: 'MRK', Lk: 'LUK', Jn: 'JHN', Ac: 'ACT',
  Ro: 'ROM', Rev: 'REV',
};
