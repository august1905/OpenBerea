// Theographic Bible Metadata helpers: date conventions, durations, ids, verse-range compression,
// Easton's Markdown → blocks, name disambiguation, and matching Theographic places to OpenBible.
import type { BookCode } from '../../../src/lib/bible/books';
import { fromVerseId, toCompact } from '../../../src/lib/bible/refs';
import { verseCount } from '../../../src/lib/bible/versification';
import type { Block, Inline } from '../../../src/lib/data/types';
import { linkRefs, normalizeInlines } from './richtext';
import { OSIS_BOOKS } from './versemap';

// ---------------------------------------------------------------------------------------------
// Years. Output convention: negative = BC with no year zero (-1015 = 1015 BC), positive = AD.

/**
 * Event startDate: ISO 8601 astronomical year, optionally with month and day
 * ("-1094" = 1095 BC, "30" = AD 30, "0030-04-04", and the malformed "0029-10-9").
 */
export function eventYear(startDate: string): number {
  const m = /^(-?\d+)/.exec(startDate.trim());
  if (!m) throw new Error(`Bad event date "${startDate}"`);
  const astro = Number(m[1]);
  return astro <= 0 ? astro - 1 : astro;
}

/** Person birthYear/deathYear are already BC-negative ("-1015" = 1015 BC). */
export function personYear(value: string | number | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n === 0) throw new Error(`Bad person year "${value}"`);
  return n;
}

/** Duration "40Y", "3M10D", "1.5Y", "1W" → years. */
export function durationYears(dur: string): number {
  let years = 0;
  let matched = '';
  for (const m of dur.matchAll(/(\d+(?:\.\d+)?)([YMWD])/g)) {
    const n = Number(m[1]);
    years += m[2] === 'Y' ? n : m[2] === 'M' ? n / 12 : m[2] === 'W' ? (n * 7) / 365.25 : n / 365.25;
    matched += m[0];
  }
  if (!matched || matched !== dur.trim()) throw new Error(`Bad duration "${dur}"`);
  return years;
}

/** End year of an event (BC-negative convention): the year in which start + duration falls. */
export function eventEndYear(startDate: string, duration: string): number {
  const m = /^(-?\d+)/.exec(startDate.trim());
  const astro = Math.floor(Number(m![1]) + durationYears(duration) + 1e-9);
  return astro <= 0 ? astro - 1 : astro;
}

/** URL-safe id from a title: "Reign of Ahaziah (Jehoahaz)" → "reign-of-ahaziah-jehoahaz". */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------------------------
// Verse ids → compact refs

/** Theographic verseID "01001001" (BBCCCVVV) → our verse id (book × 1e6 + chapter × 1e3 + verse). */
export function theoVerseId(verseID: string): number {
  if (!/^\d{8}$/.test(verseID)) throw new Error(`Bad Theographic verseID "${verseID}"`);
  return Number(verseID);
}

/**
 * Sorted, de-duplicated verse ids → compact refs, merging runs of consecutive verses (across
 * chapter breaks within a book): [GEN.1.1, GEN.1.2, GEN.1.3] → ["GEN.1.1-3"].
 */
export function compressVerseIds(ids: number[]): string[] {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const out: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = fromVerseId(sorted[i]);
    let end = start;
    while (i + 1 < sorted.length) {
      const next = fromVerseId(sorted[i + 1]);
      const follows =
        next.book === end.book &&
        ((next.chapter === end.chapter && next.verse === end.verse + 1) ||
          (next.chapter === end.chapter + 1 && next.verse === 1 && end.verse === verseCount(end.book, end.chapter)));
      if (!follows) break;
      end = next;
      i++;
    }
    if (end === start) out.push(toCompact(start));
    else if (end.chapter === start.chapter) out.push(toCompact({ ...start, endVerse: end.verse }));
    else out.push(toCompact({ ...start, endChapter: end.chapter, endVerse: end.verse }));
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Easton's text (Theographic `dictText`: Markdown with verse links) → blocks

/** "/2sam#2Sam.17.25" or "/ps#Ps.52" (and the malformed "1chr/#1Chr.8.12") → compact ref. */
export function dictLinkRef(target: string): string | null {
  const osis = target.split('#')[1];
  const m = osis && /^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?$/.exec(osis);
  const book: BookCode | undefined = m ? OSIS_BOOKS[m[1]] : undefined;
  if (!m || !book) return null;
  return toCompact({ book, chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : undefined });
}

/**
 * Converts Easton's Markdown into paragraphs, splitting on line breaks as textToBlocks does.
 * Theographic's own verse links become `ref` links. They also cover chapter-only refs such as
 * "[Ps. 52]" and bare continuations such as "[35]" that prose parsing can't resolve. A link whose
 * text is a range ("1 Sam. 16:1-13") keeps the range. Other prose refs are linked with linkRefs.
 */
export function dictToBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  for (const para of md.split(/\r?\n\s*\r?\n|\r?\n/).map((p) => p.trim()).filter(Boolean)) {
    const c: Inline[] = [];
    let last = 0;
    for (const m of para.matchAll(/\[([^\]]+)\]\(([^)\s]*)\)/g)) {
      c.push(...linkRefs(para.slice(last, m.index)));
      const target = dictLinkRef(m[2]);
      if (!target) c.push(m[1]);
      else {
        const parsed = linkRefs(m[1]).filter((x): x is Exclude<Inline, string> => typeof x !== 'string' && !!x.ref);
        // Prefer the text's own ref (it has the range) when it agrees with the link target.
        const own = parsed.length === 1 && parsed[0].ref!.split('-')[0] === target ? parsed[0].ref! : target;
        c.push({ t: m[1], ref: own });
      }
      last = m.index! + m[0].length;
    }
    c.push(...linkRefs(para.slice(last)));
    const inl = normalizeInlines(c);
    if (inl.length) blocks.push({ k: 'p', c: inl });
  }
  return blocks;
}

/**
 * Turns links whose ref fails `isValid` (e.g. "2CH.23.24" from Easton's "23; 24", read as a verse)
 * back into plain text. Returns the dropped refs for the report.
 */
export function dropInvalidRefs(blocks: Block[], isValid: (ref: string) => boolean): { blocks: Block[]; dropped: string[] } {
  const dropped: string[] = [];
  const out = blocks.map((b) => ({
    ...b,
    c: normalizeInlines(
      b.c.map((x) => {
        if (typeof x === 'string' || !x.ref || isValid(x.ref)) return x;
        dropped.push(x.ref);
        const { ref: _ref, ...rest } = x;
        return Object.keys(rest).length > 1 ? rest : rest.t;
      }),
    ),
  }));
  return { blocks: out, dropped };
}

// ---------------------------------------------------------------------------------------------
// Name disambiguation

export interface TitleInput {
  id: string;
  name: string;
  displayTitle?: string;
  disambiguation?: string;
  gender?: 'M' | 'F';
  /** Names of related people, first link of each kind. */
  father?: string;
  mother?: string;
  child?: string;
  partner?: string;
  sibling?: string;
}

export type TitleSource = 'displayTitle' | 'parent' | 'note' | 'child' | 'partner' | 'sibling';

/**
 * Theographic's "Disambiguation (temp)" notes mix descriptions ("Mighty Man of David", "the
 * Hittite", "sealed the covenant") with name meanings ("aided by Jehovah", "building me"), bare
 * names and fragments ("454 years old"). A note is used as a title only when it has no digits, no
 * divine name (name meanings), is not a bare proper name, and names a role or relation, starts
 * like a description, or is a gentilic ("the Tishbite").
 */
const ROLE_NOTE =
  /\b(sons?|daughters?|father|mother|wife|husband|brother|sister|grand(?:father|son|mother)|ancestor|descend\w*|firstborn|priests?|levites?|prophet(?:ess)?|kings?|queen|princes?|chief|leaders?|ruler|governor|commander|general|captain|officer|scribe|secretary|treasurer|steward|porter|gatekeepers?|guard|watchman|singers?|musician|player|choir|mighty|warriors?|worthies|judge|servant|nurse|midwife|herdsman|artisan|builder|goldsmith|tanner|zealot|leper|exiles?|tribe|clan|family|head|elder|apostle|disciple|companion|friend|man|woman|men)\b/i;
const DESCRIPTIVE_NOTE = /^(the|a|an|one|of|who|guilty|sealed|signed|subscribed|returned|repaired|played|supported|related|assisting|aspired|in charge|part of|in the)\b/i;
const GENTILIC_NOTE = /\b[A-Z][a-z]+ites?\b/;
const NAME_MEANING = /\b(god|lord|jehovah|yahweh|yah|jah)\b/i;

export function usableNote(text: string): boolean {
  if (/\d/.test(text) || NAME_MEANING.test(text)) return false;
  if (/^[A-Z][\w-]*$/.test(text) && !GENTILIC_NOTE.test(text)) return false;
  return ROLE_NOTE.test(text) || DESCRIPTIVE_NOTE.test(text) || GENTILIC_NOTE.test(text);
}

/**
 * Disambiguating title from the source only, in order of preference:
 * 1. Theographic's displayTitle when it is "Name (X)" → "X" (for every person);
 * then, only for names shared by several people,
 * 2. a family link: parent → "son of Jesse", else child → "father of …", partner → "wife of …",
 *    sibling → "brother of …";
 * 3. a concise "Name (X)" disambiguation note from Theographic that passes usableNote().
 */
export function personTitle(p: TitleInput, nameShared: boolean): { title: string; source: TitleSource } | null {
  const own = p.displayTitle && /^(.*?)\s*\(([^()]+)\)\s*$/.exec(p.displayTitle);
  if (own && own[2].trim()) return { title: own[2].trim(), source: 'displayTitle' };
  if (!nameShared) return null;
  const female = p.gender === 'F';
  const parent = p.father ?? p.mother;
  if (parent) return { title: `${female ? 'daughter' : 'son'} of ${parent}`, source: 'parent' };
  if (p.child) return { title: `${female ? 'mother' : 'father'} of ${p.child}`, source: 'child' };
  if (p.partner) return { title: `${female ? 'wife' : 'husband'} of ${p.partner}`, source: 'partner' };
  if (p.sibling) return { title: `${female ? 'sister' : 'brother'} of ${p.sibling}`, source: 'sibling' };
  const note = p.disambiguation && /^(.*?)\s*\(([^()]{1,60})\)\s*$/.exec(p.disambiguation.trim());
  const text = note?.[2].trim();
  if (note && note[1] === p.name && text && usableNote(text)) return { title: text, source: 'note' };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Theographic places → OpenBible place ids

export interface PlaceCandidate {
  id: string;
  /** Display name, lower case. */
  name: string;
  /** Translation spellings, lower case. */
  names: Set<string>;
  /** Verse ids mentioning the place. */
  verses: Set<number>;
}

/**
 * Matches a Theographic place to an OpenBible place: candidates share a name (the display name
 * first, then any translation spelling), and the winner is the candidate containing the most of the
 * Theographic place's verses. It must hold at least half of them and beat the runner-up.
 */
export function matchPlace(names: string[], verses: number[], candidates: PlaceCandidate[]): PlaceCandidate | null {
  const ns = names.map((n) => n.toLowerCase().trim()).filter(Boolean);
  let pool = candidates.filter((c) => ns.includes(c.name));
  if (!pool.length) pool = candidates.filter((c) => ns.some((n) => c.names.has(n)));
  if (!pool.length || !verses.length) return null;
  const scored = pool
    .map((c) => ({ c, s: verses.filter((v) => c.verses.has(v)).length / verses.length }))
    .sort((a, b) => b.s - a.s);
  const [best, second] = scored;
  if (best.s < 0.5 || (second && second.s === best.s)) return null;
  return best.c;
}

