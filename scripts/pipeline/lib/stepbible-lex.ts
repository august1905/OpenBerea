// STEPBible brief lexicons: TBESH (Hebrew) and TBESG (Greek) → StepLexEntry.
// TBESH's Meaning column (Abridged BDB, © Online Bible) is never read into the output: its use needs
// permission from Online Bible. TBESG definitions (Abbott-Smith / Middle Liddell / STEPBible) are
// converted to Block[] with Scripture refs as links.
import { type BookCode, bookInfo, isBookCode } from '../../../src/lib/bible/books';
import { fromCompact, parseBookName } from '../../../src/lib/bible/refs';
import { verseCount } from '../../../src/lib/bible/versification';
import type { Block, Inline, StepLexEntry } from '../../../src/lib/data/types';
import { htmlToBlocks } from './richtext';
import { baseStrong } from './stepbible-common';

const LEX_ROW = /^([HG]\d{4,5}[a-z]?)\t/;

export interface LexRow {
  eStrong: string;
  dStrong: string;
  /** Relation note after the dStrong ("a Name of", "in Aramaic"), may be empty. */
  relation: string;
  uStrong: string;
  lemma: string;
  translit: string;
  morph: string;
  gloss: string;
  /** Column 8. Only read for TBESG. */
  meaning: string;
}

/** Parses a data row of TBESH or TBESG (8 tab-separated fields). Header lines return null. */
export function parseLexRow(line: string): LexRow | null {
  if (!LEX_ROW.test(line)) return null;
  const f = line.split('\t');
  if (f.length < 7) throw new Error(`Lexicon row with ${f.length} fields: ${line.slice(0, 60)}`);
  const d = f[1].trim();
  const sp = d.indexOf(' ');
  return {
    eStrong: f[0].trim(),
    dStrong: sp >= 0 ? d.slice(0, sp) : d,
    relation: sp >= 0 ? d.slice(sp + 1).replace(/^=\s*/, '').trim() : '',
    uStrong: f[2].trim(),
    lemma: f[3].trim(),
    translit: f[4].trim(),
    morph: f[5].trim(),
    gloss: f[6].trim(),
    meaning: f[7] ?? '',
  };
}

// ---------------------------------------------------------------------------------------------
// Scripture refs inside TBESG definitions: <ref='Mat.5.43'>Mat.5:43;</ref>,
// <ref='Job.26.6; 28.22; 31.12'>Job.26:6, 28:22, 31:12</ref>, <ref='Jude.12'>Ju 12</ref>.

function refBook(name: string): BookCode | null {
  const up = name.toUpperCase();
  if (isBookCode(up)) return up;
  return parseBookName(name);
}

function compact(book: BookCode, ch: number, vs: number | undefined, end?: number): string | null {
  if (!Number.isFinite(ch) || ch < 1 || ch > bookInfo(book).chapters) return null;
  if (vs === undefined) return `${book}.${ch}`;
  const n = verseCount(book, ch);
  if (vs < 1 || vs > n) return null;
  if (end !== undefined && end > vs && end <= n) return `${book}.${ch}.${vs}-${end}`;
  return `${book}.${ch}.${vs}`;
}

/**
 * Parses a STEP-style reference list into compact refs. Later parts inherit the book and chapter:
 * "Job.26.6; 28.22" → ["JOB.26.6", "JOB.28.22"], "2Ti.4.8, 10" → ["2TI.4.8", "2TI.4.10"].
 * Parts that don't resolve to a KJV verse are returned as null so callers can keep positions.
 */
export function parseStepRefList(attr: string): (string | null)[] {
  const out: (string | null)[] = [];
  let book: BookCode | null = null;
  let chapter = 0;
  const parts = attr
    .trim()
    .replace(/[.;,\s]+$/, '')
    .split(/\s*[;,]\s*/)
    .filter(Boolean);
  for (const part of parts) {
    const m = /^(?:([1-3]?[A-Za-z]+)\.?)?\s*(\d+)(?:[.:](\d+))?(?:[.:](\d+))?(?:-(\d+))?\.?$/.exec(part.trim());
    if (!m) {
      out.push(null);
      continue;
    }
    if (m[1]) {
      book = refBook(m[1]);
      chapter = 0;
    }
    if (!book) {
      out.push(null);
      continue;
    }
    const nums = [m[2], m[3], m[4]].filter((n) => n !== undefined).map(Number);
    const end = m[5] ? Number(m[5]) : undefined;
    let ref: string | null = null;
    if (nums.length === 3) {
      // Book.ch.vs written with a stray extra number: ignore it.
      chapter = nums[0];
      ref = compact(book, chapter, nums[1], end);
    } else if (nums.length === 2) {
      chapter = nums[0];
      ref = compact(book, chapter, nums[1], end);
    } else if (m[1] && bookInfo(book).chapters === 1) {
      chapter = 1;
      ref = compact(book, 1, nums[0], end);
    } else if (m[1]) {
      chapter = nums[0];
      ref = compact(book, chapter, undefined);
    } else if (chapter) {
      ref = compact(book, chapter, nums[0], end);
    }
    out.push(ref);
  }
  return out;
}

const escapeAttr = (s: string) => s.replace(/"/g, '&quot;');

/**
 * Splits the text of a multi-ref tag into as many pieces as there are refs:
 * "Job.26:6, 28:22, 31:12" → pieces ["Job.26:6", "28:22", "31:12"], separators [", ", ", "].
 */
export function splitRefText(text: string, n: number): { pieces: string[]; seps: string[]; trailing: string } | null {
  if (text.includes('<')) return null;
  for (const re of [/(\s*[;,]\s*)/, /(\s+)(?=\d)/]) {
    const bits = text.split(re);
    const pieces: string[] = [];
    const seps: string[] = [];
    for (let i = 0; i < bits.length; i++) (i % 2 ? seps : pieces).push(bits[i]);
    let trailing = '';
    // A trailing separator ("Mat.5:43;") leaves an empty last piece.
    if (pieces.length > 1 && pieces[pieces.length - 1] === '') {
      pieces.pop();
      trailing = seps.pop()!;
    }
    if (pieces.length === n && pieces.every((p) => p.trim())) return { pieces, seps, trailing };
  }
  return null;
}

function linkedRefHtml(attr: string, inner: string): string {
  const refs = parseStepRefList(attr);
  const valid = refs.filter((r): r is string => !!r);
  if (!valid.length) return inner;
  const whole = `<ref osis="${escapeAttr(valid[0])}">${inner}</ref>`;
  if (refs.length === 1) return whole;
  const split = splitRefText(inner, refs.length);
  if (!split) return whole;
  let html = '';
  split.pieces.forEach((piece, i) => {
    const ref = refs[i];
    html += ref ? `<ref osis="${escapeAttr(ref)}">${piece}</ref>` : piece;
    if (i < split.seps.length) html += split.seps[i];
  });
  return html + split.trailing;
}

/**
 * Rewrites STEP <ref='…'> tags (possibly nested or malformed) into <ref osis="BOOK.c.v"> tags that
 * htmlToBlocks understands. Nested refs are flattened into their outer ref.
 */
export function rewriteStepRefs(html: string): string {
  const re = /<ref\s*=\s*'([^']*)'\s*>|<ref\s*=\s*"([^"]*)"\s*>|<\/ref\s*>/gi;
  let out = '';
  let depth = 0;
  let attr = '';
  let inner = '';
  let last = 0;
  for (const m of html.matchAll(re)) {
    const text = html.slice(last, m.index);
    last = m.index! + m[0].length;
    if (depth === 0) out += text;
    else inner += text;
    if (m[0].startsWith('</')) {
      if (depth === 0) continue; // stray close tag
      depth--;
      if (depth === 0) {
        out += linkedRefHtml(attr, inner);
        inner = '';
      }
    } else {
      if (depth === 0) attr = m[1] ?? m[2] ?? '';
      depth++;
    }
  }
  const rest = html.slice(last);
  if (depth > 0) out += linkedRefHtml(attr, inner + rest);
  else out += rest;
  return out;
}

/** Source tag at the end of a TBESG definition: "(AS)" Abbott-Smith, "(ML)" Middle Liddell. */
export function definitionSource(meaning: string): { html: string; src: 'AS' | 'ML' | 'STEP' } {
  const m = /\s*\((AS|ML)\)\s*$/.exec(meaning);
  if (m) return { html: meaning.slice(0, m.index), src: m[1] as 'AS' | 'ML' };
  return { html: meaning, src: 'STEP' };
}

/**
 * Converts a TBESG definition to blocks: refs become links, <re> synonym notes become their own
 * paragraph, "__1." / "__(a)" indentation markers become list items, transcriber <note>s are dropped.
 */
export function tbesgDefinition(meaning: string): { d: Block[]; src: 'AS' | 'ML' | 'STEP' } {
  const { html, src } = definitionSource(meaning);
  const prepared = rewriteStepRefs(html)
    .replace(/<re>/gi, '<p>')
    .replace(/<\/re>/gi, '</p>')
    .replace(/<br\s*\/?>/gi, '<br/>');
  const blocks = htmlToBlocks(prepared, {
    refAttr: (attrs) => attrs.osis ?? null,
    drop: ['note', 'script', 'style'],
  });
  const d: Block[] = [];
  for (const raw of blocks) {
    const block: Block = { ...raw, c: raw.c.map(checkRef) };
    const first = block.c[0];
    const text = typeof first === 'string' ? first : first?.t;
    if (text !== undefined && /^__/.test(text)) {
      const stripped = text.replace(/^__\s*/, '');
      const c = [...block.c];
      c[0] = typeof first === 'string' ? stripped : { ...first, t: stripped };
      const cleaned = c.filter((p) => (typeof p === 'string' ? p.length : p.t.length));
      if (!cleaned.length) continue;
      d.push({ k: 'li', c: cleaned, d: /^\(/.test(stripped) ? 1 : 0 });
    } else {
      d.push(block);
    }
  }
  return { d, src };
}

/** True when a compact ref names a chapter (and verses) that exist in the KJV versification. */
export function isKjvRef(ref: string): boolean {
  const r = fromCompact(ref);
  if (!r || r.chapter < 1 || r.chapter > bookInfo(r.book).chapters) return false;
  if (r.verse === undefined) return true;
  const endCh = r.endChapter ?? r.chapter;
  if (endCh > bookInfo(r.book).chapters) return false;
  if (r.verse < 1 || r.verse > verseCount(r.book, r.chapter)) return false;
  return r.endVerse === undefined || r.endVerse <= verseCount(r.book, endCh);
}

/** Refs found in prose can carry LXX numbering ("Ps 29:12"); links outside the KJV are dropped. */
export const droppedRefs: string[] = [];

function checkRef(c: Inline): Inline {
  if (typeof c === 'string' || !c.ref || isKjvRef(c.ref)) return c;
  droppedRefs.push(c.ref);
  const { ref: _ref, ...rest } = c;
  return Object.keys(rest).length === 1 ? rest.t : rest;
}

/** Builds a StepLexEntry. `pos` is the decoded brief morph code; TBESH definitions are never used. */
export function lexEntry(row: LexRow, lang: 'hbo' | 'grc', pos: string | undefined): StepLexEntry {
  const base = baseStrong(row.dStrong) ?? baseStrong(row.eStrong);
  if (!base) throw new Error(`Lexicon: bad id ${row.dStrong}`);
  const entry: StepLexEntry = { id: row.dStrong, base, lemma: row.lemma, x: row.translit, g: row.gloss };
  if (pos) entry.pos = pos;
  if (lang === 'grc' && row.meaning.trim()) {
    const { d, src } = tbesgDefinition(row.meaning);
    if (d.length) {
      entry.d = d;
      entry.src = src;
    }
  }
  return entry;
}

// ---------------------------------------------------------------------------------------------
// Extended-id resolution for the texts: TAHOT/TAGNT occasionally use dStrongs that the brief
// lexicon doesn't have (H0430J, G2453); those fall back to the first entry with the same number.

export class LexIds {
  private ids = new Set<string>();
  private byNumber = new Map<string, string>();
  readonly fallbacks = new Map<string, string>();
  readonly missing = new Map<string, number>();

  add(row: Pick<LexRow, 'eStrong' | 'dStrong'>) {
    this.ids.add(row.dStrong);
    const key = numberKey(row.eStrong);
    if (!this.byNumber.has(key)) this.byNumber.set(key, row.dStrong);
    const dKey = numberKey(row.dStrong);
    if (!this.byNumber.has(dKey)) this.byNumber.set(dKey, row.dStrong);
  }

  has(id: string) {
    return this.ids.has(id);
  }

  get size() {
    return this.ids.size;
  }

  resolve = (dStrong: string): string | null => {
    if (this.ids.has(dStrong)) return dStrong;
    const fb = this.byNumber.get(numberKey(dStrong));
    if (fb) {
      this.fallbacks.set(dStrong, fb);
      return fb;
    }
    this.missing.set(dStrong, (this.missing.get(dStrong) ?? 0) + 1);
    return null;
  };
}

/** "H1254a" / "H1254A" / "G0025" → "H1254" / "G0025": the zero-padded number without letters. */
function numberKey(id: string): string {
  const m = /^([HG])(\d+)/.exec(id);
  return m ? `${m[1]}${m[2].padStart(4, '0')}` : id;
}
