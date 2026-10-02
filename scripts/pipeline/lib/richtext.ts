// Converts source markup (simple HTML, ThML, OSIS fragments) into the app's Block/Inline rich text,
// and turns Scripture references written in prose ("Gen. 12:1; 15:6", "John 3:16") into links.
import { bookInfo } from '../../../src/lib/bible/books';
import { parseBookName, type Ref, toCompact } from '../../../src/lib/bible/refs';
import { verseCount } from '../../../src/lib/bible/versification';
import type { Block, Inline } from '../../../src/lib/data/types';

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', para: '¶', sect: '§', deg: '°', frac12: '½',
  frac14: '¼', frac34: '¾', times: '×', aelig: 'æ', AElig: 'Æ', oelig: 'œ', OElig: 'Œ', eacute: 'é',
  egrave: 'è', ecirc: 'ê', euml: 'ë', aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', iacute: 'í',
  icirc: 'î', iuml: 'ï', oacute: 'ó', ocirc: 'ô', ouml: 'ö', uacute: 'ú', ucirc: 'û', uuml: 'ü', ccedil: 'ç',
  ntilde: 'ñ', szlig: 'ß', dagger: '†', Dagger: '‡', prime: '′', Prime: '″', shy: '',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code] ?? m;
  });
}

const HEBREW = /[֐-׿יִ-ﭏ]/;
const GREEK = /[Ͱ-Ͽἀ-῿]/;

/** Marks runs of Hebrew or Greek inside plain text so the app can pick the right font. */
export function tagScripts(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /([֐-׿יִ-ﭏ][֐-׿יִ-ﭏ\s־־]*[֐-׿יִ-ﭏ]|[֐-׿יִ-ﭏ])|([Ͱ-Ͽἀ-῿][Ͱ-Ͽἀ-῿\s]*[Ͱ-Ͽἀ-῿]|[Ͱ-Ͽἀ-῿])/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push({ t: m[0], l: m[1] ? 'hbo' : 'grc' });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Book names as they appear in prose: "Gen.", "1 Sam.", "Song of Solomon", "Ps", "Joh".
const PROSE_REF =
  /\b((?:[1-3]|I{1,3})\s?[A-Z][a-z]{1,14}\.?|Song of (?:Solomon|Songs)|[A-Z][a-z]{1,14}\.?)\s+(\d{1,3})\s?[:.]\s?(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?/g;
const CONTINUE = /^(\s*[;,]\s*)(?:(\d{1,3})\s?[:.]\s?(\d{1,3})|(\d{1,3}))(?:\s?[-–]\s?(\d{1,3}))?(?![\d:])/;

const NOT_BOOKS = new Set(['chap', 'chapter', 'ch', 'ver', 'verse', 'vers', 'see', 'comp', 'cf', 'p', 'vol', 'art', 'sec', 'note', 'line']);

function makeRef(book: Ref['book'], chapter: number, verse: number, end?: number): Ref | null {
  if (chapter < 1 || chapter > bookInfo(book).chapters || verse < 1 || verse > verseCount(book, chapter)) return null;
  const ref: Ref = { book, chapter, verse };
  if (end !== undefined && end > verseCount(book, chapter)) return null; // a wrong range stays plain text
  if (end !== undefined && end > verse) ref.endVerse = end;
  return ref;
}

/**
 * Finds Scripture references in prose and returns inlines with `ref` links. Continuations such as
 * "Gen. 12:1; 15:6, 8" link each part to the same book.
 */
export function linkRefs(text: string, base: Omit<Exclude<Inline, string>, 't'> = {}): Inline[] {
  const out: Inline[] = [];
  const plain = (t: string) => {
    if (!t) return;
    for (const piece of tagScripts(t)) {
      if (typeof piece === 'string') out.push(Object.keys(base).length ? { ...base, t: piece } : piece);
      else out.push({ ...base, ...piece });
    }
  };
  let last = 0;
  PROSE_REF.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROSE_REF.exec(text))) {
    const name = m[1].replace(/\.$/, '');
    if (NOT_BOOKS.has(name.toLowerCase())) continue;
    const book = parseBookName(name.replace(/^III\s?/, '3 ').replace(/^II\s?/, '2 ').replace(/^I\s/, '1 '));
    if (!book) continue;
    const first = makeRef(book, Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : undefined);
    if (!first) continue;
    plain(text.slice(last, m.index));
    out.push({ ...base, t: m[0], ref: toCompact(first) });
    let pos = m.index + m[0].length;
    let chapter = first.chapter;
    // Continuations: "; 15:6" (new chapter) or ", 8" (same chapter).
    for (;;) {
      const c = CONTINUE.exec(text.slice(pos));
      if (!c) break;
      const ch = c[2] ? Number(c[2]) : chapter;
      const vs = c[2] ? Number(c[3]) : Number(c[4]);
      const ref = makeRef(book, ch, vs, c[5] ? Number(c[5]) : undefined);
      if (!ref) break;
      plain(c[1]);
      out.push({ ...base, t: c[0].slice(c[1].length), ref: toCompact(ref) });
      chapter = ch;
      pos += c[0].length;
    }
    last = pos;
    PROSE_REF.lastIndex = pos;
  }
  plain(text.slice(last));
  return out;
}

/** Merges adjacent plain strings and drops empty runs. */
export function normalizeInlines(inlines: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const piece of inlines) {
    const t = typeof piece === 'string' ? piece : piece.t;
    if (!t) continue;
    const prev = out[out.length - 1];
    if (typeof piece === 'string' && typeof prev === 'string') out[out.length - 1] = prev + piece;
    else if (
      typeof piece !== 'string' &&
      typeof prev !== 'string' &&
      prev &&
      JSON.stringify({ ...prev, t: '' }) === JSON.stringify({ ...piece, t: '' }) &&
      !piece.ref &&
      !piece.s &&
      !piece.href
    )
      out[out.length - 1] = { ...prev, t: prev.t + piece.t };
    else out.push(piece);
  }
  // Collapse whitespace across runs.
  return out
    .map((p) => (typeof p === 'string' ? p.replace(/\s+/g, ' ') : { ...p, t: p.t.replace(/\s+/g, ' ') }))
    .filter((p) => (typeof p === 'string' ? p.length : p.t.length));
}

function trimBlock(block: Block): Block | null {
  const c = normalizeInlines(block.c);
  if (!c.length) return null;
  const first = c[0];
  const lastI = c.length - 1;
  if (typeof first === 'string') c[0] = first.trimStart();
  else c[0] = { ...first, t: first.t.trimStart() };
  const last = c[lastI];
  if (typeof last === 'string') c[lastI] = last.trimEnd();
  else c[lastI] = { ...last, t: last.t.trimEnd() };
  const cleaned = c.filter((p) => (typeof p === 'string' ? p.length : p.t.length));
  return cleaned.length ? { ...block, c: cleaned } : null;
}

export interface HtmlOptions {
  /** Converts a reference attribute (OSIS "John.3.16", ThML passage, …) to a compact ref, or null. */
  refAttr?: (attrs: Record<string, string>, text: string) => string | null;
  /** Converts a Strong's attribute to "G25"/"H430", or null. */
  strongsAttr?: (attrs: Record<string, string>, text: string) => string | null;
  /** Link Scripture references found in plain text (default true). */
  linkProse?: boolean;
  /** Tags whose content is dropped entirely (e.g. "note", "script"). */
  drop?: string[];
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return attrs;
}

const BLOCK_TAGS: Record<string, Block['k']> = {
  p: 'p', div: 'p', h1: 'h', h2: 'h', h3: 'h', h4: 'h', h5: 'h', h6: 'h', li: 'li', blockquote: 'q',
  title: 'h', lg: 'q', item: 'li', list: 'p', br: 'p', lb: 'p', head: 'h',
};

/**
 * Converts an HTML/ThML/OSIS-like fragment into blocks. Unknown tags are transparent. Block-level
 * tags start new blocks; <b>/<i>/<sup> and reference/Strong's tags become inline marks.
 */
export function htmlToBlocks(html: string, opts: HtmlOptions = {}): Block[] {
  const linkProse = opts.linkProse ?? true;
  const drop = new Set((opts.drop ?? ['script', 'style', 'note']).map((d) => d.toLowerCase()));
  const blocks: Block[] = [];
  let current: Block = { k: 'p', c: [] };
  let listDepth = -1;
  const marks: { tag: string; i?: 1; b?: 1; sup?: 1; ref?: string; s?: string; href?: string }[] = [];
  let dropDepth = 0;
  let dropTag = '';

  const flush = (next: Block['k'] = 'p') => {
    const done = trimBlock(current);
    if (done) blocks.push(done);
    current = { k: next, c: [] };
    if (next === 'li') current.d = Math.max(0, listDepth);
  };

  const emitText = (raw: string) => {
    if (!raw) return;
    const text = decodeEntities(raw);
    const mark: Omit<Exclude<Inline, string>, 't'> = {};
    for (const m of marks) {
      if (m.i) mark.i = 1;
      if (m.b) mark.b = 1;
      if (m.sup) mark.sup = 1;
      if (m.ref) mark.ref = m.ref;
      if (m.s) mark.s = m.s;
      if (m.href) mark.href = m.href;
    }
    if (mark.ref || mark.s || mark.href) {
      current.c.push({ ...mark, t: text });
    } else if (linkProse) {
      current.c.push(...linkRefs(text, mark));
    } else {
      for (const piece of tagScripts(text)) {
        current.c.push(typeof piece === 'string' ? (Object.keys(mark).length ? { ...mark, t: piece } : piece) : { ...mark, ...piece });
      }
    }
  };

  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>|([^<]+)/g;
  // Look-ahead text for tags that carry their reference in the content.
  for (const m of html.matchAll(re)) {
    if (m[5] !== undefined) {
      if (!dropDepth) emitText(m[5]);
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase().replace(/^\w+:/, '');
    const selfClosing = m[4] === '/' || tag === 'br' || tag === 'lb' || tag === 'milestone';
    const attrs = parseAttrs(m[3]);

    if (dropDepth) {
      if (tag === dropTag && !selfClosing) dropDepth += closing ? -1 : 1;
      continue;
    }
    if (!closing && drop.has(tag) && !selfClosing) {
      dropDepth = 1;
      dropTag = tag;
      continue;
    }

    if (tag === 'ul' || tag === 'ol' || tag === 'list') {
      listDepth += closing ? -1 : 1;
      if (closing) flush();
      continue;
    }
    if (BLOCK_TAGS[tag]) {
      if (selfClosing) {
        if (tag === 'br' || tag === 'lb') flush(current.k === 'li' ? 'li' : 'p');
        continue;
      }
      if (closing) flush();
      else flush(BLOCK_TAGS[tag]);
      continue;
    }

    if (closing) {
      const idx = marks.map((x) => x.tag).lastIndexOf(tag);
      if (idx >= 0) marks.splice(idx, 1);
      continue;
    }
    if (selfClosing) continue;
    const mark: (typeof marks)[number] = { tag };
    const hi = tag === 'hi' ? `${attrs.type ?? ''} ${attrs.rend ?? ''}` : '';
    if (tag === 'i' || tag === 'em' || /italic/.test(hi) || tag === 'foreign') mark.i = 1;
    if (tag === 'b' || tag === 'strong' || /bold/.test(hi)) mark.b = 1;
    if (tag === 'sup' || /super/.test(hi)) mark.sup = 1;
    if (tag === 'reference' || tag === 'scripref' || tag === 'ref' || tag === 'scripture') {
      const ref = opts.refAttr?.(attrs, '') ?? null;
      if (ref) mark.ref = ref;
    }
    if (tag === 'a' && attrs.href) {
      const s = opts.strongsAttr?.(attrs, '') ?? null;
      if (s) mark.s = s;
      else if (/^https?:/.test(attrs.href)) mark.href = attrs.href;
    }
    if (tag === 'w' || tag === 'sync') {
      const s = opts.strongsAttr?.(attrs, '') ?? null;
      if (s) mark.s = s;
    }
    marks.push(mark);
  }
  flush();
  return blocks;
}

/** Plain text of blocks (for search snippets and tests). */
export function blocksToText(blocks: Block[]): string {
  return blocks.map((b) => b.c.map((c) => (typeof c === 'string' ? c : c.t)).join('')).join('\n');
}

/** Paragraphs from plain text with blank-line or newline breaks. */
export function textToBlocks(text: string): Block[] {
  return text
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ k: 'p' as const, c: normalizeInlines(linkRefs(p)) }));
}

export { GREEK, HEBREW };
