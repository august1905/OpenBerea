// Dictionary entries (CrossWire Easton, ISBE and Nave TEI; Smith ThML) → DictEntry blocks, plus ids,
// titles and bucketing for dict/{id}/index.json and dict/{id}/{bucket}.json.
//
// References are resolved first by dict-refs.linkMarkup, which leaves <ref c|h|s="…"> elements;
// htmlToBlocks turns those into `ref` inlines (refAttr below), and finishBlocks moves the h/s
// sentinels into `href` / `s`.
import type { Block, DictEntry, Inline } from '../../../src/lib/data/types';
import { isValidCompact, linkMarkup, type MarkupOptions, type RefStats } from './dict-refs';
import { decodeEntities, htmlToBlocks } from './richtext';

// ---------------------------------------------------------------------------------------------
// Ids, titles, buckets

/** URL-safe slug of a key: "ABRAHAM’S BOSOM" → "abraham-s-bosom", "NICANOR (1)" → "nicanor-1". */
export function slugify(key: string): string {
  const s = key
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'entry';
}

/** Slugs made unique by numbering repeats in order: "agrippa-i", "agrippa-i-2". */
export function uniqueSlugs(keys: string[]): string[] {
  const used = new Set<string>();
  return keys.map((k) => {
    const base = slugify(k);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'over', 'the', 'to',
  'unto', 'upon', 'with', 'without',
]);
const ROMAN = /^(?:I{1,3}|IV|VI{0,3}|IX|XI{0,3})\.?$/;

/**
 * Title case for upper-case headwords, in the style of the printed dictionaries: "AARON'S ROD" →
 * "Aaron's Rod", "BETH-EL" → "Beth-el", "ABIA, ABIAH, OR ABIJAH" → "Abia, Abiah, or Abijah",
 * "AGRIPPA II." → "Agrippa II.", "BEN-HUR (R. V.)" → "Ben-hur (R. V.)".
 */
export function titleCase(key: string): string {
  const words = key.trim().replace(/\s+/g, ' ').split(' ');
  return words
    .map((w, i) => {
      const bare = w.replace(/^[("'“‘[]+|[)"'”’\].,;:!?]+$/g, '');
      const core = w.replace(/^[("'“‘[]+|[)"'”’\],;:!?]+$/g, '');
      if (!bare) return w;
      if (ROMAN.test(bare) && i > 0) return w;
      if (/^(?:[A-Z]\.)+$/.test(core)) return w; // R. V., A.V.
      const lower = w.toLowerCase();
      const prev = words[i - 1] ?? '';
      if (i > 0 && SMALL_WORDS.has(bare.toLowerCase()) && !/[(;:]$/.test(prev) && !/^[(]/.test(w)) return lower;
      // Capitalize the first letter (after any opening punctuation); keep "-el", "’s" lower case.
      return lower.replace(/^([^a-z\p{L}]*)(\p{L})/u, (_, p: string, c: string) => p + c.toUpperCase());
    })
    .join(' ');
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function compareTitles(a: { title: string; id: string }, b: { title: string; id: string }): number {
  return collator.compare(a.title, b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Groups entries (already sorted by title) into buckets of about `target` bytes of JSON. An entry
 * larger than the target gets a bucket of its own; a last bucket under a quarter of the target is
 * merged into the one before it when the two stay within `max`.
 */
export function assignBuckets(sizes: number[], target: number, max = target): number[] {
  const out: number[] = [];
  const totals: number[] = [];
  let bucket = 0;
  let bytes = 0;
  for (const size of sizes) {
    if (bytes > 0 && bytes + size > target) {
      totals.push(bytes);
      bucket++;
      bytes = 0;
    }
    out.push(bucket);
    bytes += size;
  }
  totals.push(bytes);
  if (bucket > 0 && bytes < target / 4 && totals[bucket - 1] + bytes <= max) {
    for (let i = out.length - 1; i >= 0 && out[i] === bucket; i--) out[i] = bucket - 1;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Blocks

/** The ref value htmlToBlocks stores for a resolved element: compact ref, "@href", or "§G25". */
export function refAttr(a: Record<string, string>): string | null {
  return a.c ?? (a.h ? `@${a.h}` : a.s ? `§${a.s}` : null);
}

export interface FinishStats {
  /** ref inlines that were not valid KJV refs and lost their link. */
  invalid: number;
}

/** Moves the href/Strong's sentinels out of `ref`, re-checks every ref, and drops empty blocks. */
export function finishBlocks(blocks: Block[], stats: FinishStats = { invalid: 0 }): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const c: Inline[] = [];
    for (const piece of b.c) {
      if (typeof piece === 'string' || !piece.ref) {
        c.push(piece);
        continue;
      }
      const { ref, ...rest } = piece;
      if (ref.startsWith('@')) c.push({ ...rest, href: ref.slice(1) });
      else if (ref.startsWith('§')) c.push({ ...rest, s: ref.slice(1) });
      else if (isValidCompact(ref)) c.push(piece);
      else {
        stats.invalid++;
        c.push(Object.keys(rest).length > 1 ? rest : rest.t);
      }
    }
    if (c.some((p) => (typeof p === 'string' ? p.trim() : p.t.trim()))) out.push({ ...b, c });
  }
  return out;
}

/** htmlToBlocks for markup that dict-refs.linkMarkup has already linked. */
export function linkedToBlocks(html: string, stats?: FinishStats): Block[] {
  return finishBlocks(htmlToBlocks(html, { refAttr, linkProse: false }), stats);
}

/** Inlines of a fragment that holds no block elements. */
export function linkedToInlines(html: string, stats?: FinishStats): Inline[] {
  return linkedToBlocks(html, stats).flatMap((b, i) => (i ? [' ', ...b.c] : b.c));
}

// ---------------------------------------------------------------------------------------------
// TEI (Easton, ISBE): <entryFree n=…><title>…</title><p>…</p></entryFree>

export interface ConvertedEntry {
  /** The <title> as printed, when the entry has one. */
  title?: string;
  blocks: Block[];
  refs: RefStats;
  /** Ref inlines dropped by finishBlocks (should stay 0: linkMarkup already validated them). */
  invalid: number;
}

/** <hi rend="…"> → <i>/<b>/<sup>; a paragraph that is only an underlined phrase becomes a heading. */
export function normalizeTeiHi(tei: string): string {
  return tei
    .replace(/<p>\s*<hi rend="underline">([^<]*)<\/hi>\s*<\/p>/g, '<head>$1</head>')
    .replace(/<hi rend="(italic|bold|underline|super)">([\s\S]*?)<\/hi>/g, (_, rend: string, inner: string) => {
      const tag = rend === 'italic' ? 'i' : rend === 'super' ? 'sup' : 'b';
      return `<${tag}>${inner}</${tag}>`;
    });
}

export function teiEntryToBlocks(tei: string, opts: MarkupOptions = {}): ConvertedEntry {
  const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(tei);
  const body = normalizeTeiHi(
    tei
      .replace(/<\/?entryFree\b[^>]*>/g, '')
      .replace(/<title>[\s\S]*?<\/title>/, ''),
  );
  const { html, stats } = linkMarkup(body, opts);
  const fin: FinishStats = { invalid: 0 };
  const blocks = linkedToBlocks(html, fin);
  const out: ConvertedEntry = { blocks, refs: stats, invalid: fin.invalid };
  if (titleMatch) out.title = decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '')).trim();
  return out;
}

/**
 * Removes the e-text markers ISBE kept from its source, in text only: "/APC" and "/RAPC" before
 * Apocrypha references ("/APC Tobit 1:21"), "/Av", and "@" / "~" before Greek and Hebrew
 * transliterations ("[ @apostolos]", "(~to'ar, 1Sa 25:3)").
 */
export function cleanIsbeMarkers(markup: string): string {
  return markup.replace(/(<[^>]*>)|([^<]+)/g, (_, tag: string | undefined, text: string | undefined) =>
    tag ?? text!.replace(/\/R?APC\s+|\/Av\s+(?=[1-3]?[A-Z])/g, '').replace(/[@~]+(?=[A-Za-z'`])/g, ''),
  );
}

// ---------------------------------------------------------------------------------------------
// Nave (TEI topical index): <def><lb/>→ SUBTOPIC refs… <list><item>…</item></list></def>

/**
 * Nave topics keep their structure: each "→" line is a paragraph whose lead-in (the words before
 * its first verse) is bold, or a heading when it has no verses and a list follows; list items are
 * `li` blocks with their nesting depth. Every verse stays a link.
 */
export function naveEntryToBlocks(tei: string, key: string, opts: MarkupOptions = {}): ConvertedEntry {
  // "DEATH&amp;gt;": a stray ">" in 8 topics, escaped twice.
  const def = (/<def>([\s\S]*?)<\/def>/.exec(tei)?.[1] ?? tei.replace(/<\/?entryFree\b[^>]*>/g, '')).replace(/&amp;(?:gt|lt);/g, '');
  // "<lb/>REVERENCEGe 35:5": the topic name glued to a reference.
  const keyRe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = def.replace(new RegExp(`(<lb/>\\s*)${keyRe}(?=[1-3]?[A-Z][a-z])`, 'g'), `$1${key} `);
  const { html, stats } = linkMarkup(body, opts);
  const fin: FinishStats = { invalid: 0 };
  const blocks: Block[] = [];
  let depth = 0;
  let line = '';
  let item: string | null = null;

  const lineBlock = (markup: string, followedByList: boolean) => {
    const text = markup.replace(/^\s*→\s*/, '').trim();
    if (!text.replace(/<[^>]*>/g, '').trim()) return;
    const firstVerse = text.indexOf('<ref c=');
    const plain = text.replace(/<[^>]*>/g, '').trim();
    let markupOut: string;
    let k: Block['k'] = 'p';
    if (/^see\b/i.test(plain)) markupOut = text;
    else if (firstVerse < 0) {
      if (followedByList) k = 'h';
      markupOut = k === 'h' ? text : `<b>${text}</b>`;
    } else {
      const lead = text.slice(0, firstVerse);
      const leadText = lead.replace(/<[^>]*>/g, '').trim();
      markupOut = leadText ? `<b>${lead.trimEnd()}</b> ${text.slice(firstVerse)}` : text;
    }
    const c = linkedToInlines(markupOut, fin);
    if (c.length) blocks.push({ k, c });
  };
  const flushLine = (followedByList: boolean) => {
    if (line.trim()) lineBlock(line, followedByList);
    line = '';
  };

  for (const m of html.matchAll(/<lb\s*\/>|<list>|<\/list>|<item>|<\/item>|<[^>]*>|[^<]+/g)) {
    const tok = m[0];
    if (/^<lb\s*\/>$/.test(tok)) {
      if (item !== null) item += ' ';
      else flushLine(false);
    } else if (tok === '<list>') {
      if (item !== null) {
        // A nested list inside an item: the item text so far is its own entry.
        const c = linkedToInlines(item, fin);
        if (c.length) blocks.push({ k: 'li', c, d: depth - 1 });
        item = null;
      } else flushLine(true);
      depth++;
    } else if (tok === '</list>') {
      depth = Math.max(0, depth - 1);
    } else if (tok === '<item>') {
      item = '';
    } else if (tok === '</item>') {
      const c = linkedToInlines(item ?? '', fin);
      if (c.length) blocks.push({ k: 'li', c, d: Math.max(0, depth - 1) });
      item = null;
    } else if (item !== null) item += tok;
    else line += tok;
  }
  flushLine(false);
  return { blocks, refs: stats, invalid: fin.invalid };
}

// ---------------------------------------------------------------------------------------------
// ThML (Smith v1.3): <i>, <scripRef passage>, <term>, <ol><li>, "--" dashes, straight quotes

/**
 * Typographic dashes and double quotes in text, not in tags: "--" → "—", "x" → “x”. A quote is
 * opening after a space, an opening bracket or a dash (looking back across tags), else closing.
 */
export function typography(markup: string): string {
  let prev = ' ';
  return markup.replace(/(<[^>]*>)|([^<]+)/g, (_, tag: string | undefined, text: string | undefined) => {
    if (tag) return tag;
    let out = '';
    for (const ch of text!.replace(/--/g, '—')) {
      out += ch === '"' ? (/[\s([{—–-]/.test(prev) ? '“' : '”') : ch;
      prev = ch;
    }
    return out;
  });
}

/** Smith's passages write "phm" for Philippians; Philemon has a single chapter. */
export function fixSmithPassage(markup: string): string {
  return markup.replace(/(passage=")phm (?=[2-4]:)/g, '$1php ');
}

export function thmlEntryToBlocks(thml: string, opts: MarkupOptions = {}): ConvertedEntry {
  const { html, stats } = linkMarkup(typography(fixSmithPassage(thml)), { trustAttr: true, ...opts });
  const fin: FinishStats = { invalid: 0 };
  return { blocks: linkedToBlocks(`<p>${html}</p>`, fin), refs: stats, invalid: fin.invalid };
}

// ---------------------------------------------------------------------------------------------
// Cross-entry targets

/** Folded form of a key for target lookup: letters and digits only, upper case. */
export function foldTarget(key: string): string {
  return key.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Resolves "Easton:MOSES" (or a bare key) to an entry id through exact and folded key maps. */
export class TargetIndex {
  private exact = new Map<string, string>();
  private folded = new Map<string, string>();
  /** Folded alternative or base form → keys: "ABIGAIL; ABIGAL" → ABIGAIL, ABIGAL; "ABI (1)" → ABI. */
  private alts = new Map<string, string[]>();
  resolved = 0;
  unresolved: string[] = [];

  constructor(entries: { key: string; id: string }[]) {
    for (const e of entries) {
      if (!this.exact.has(e.key)) this.exact.set(e.key, e.id);
      const f = foldTarget(e.key);
      if (!this.folded.has(f)) this.folded.set(f, e.id);
      for (const alt of e.key.split(/;\s*/)) {
        const base = foldTarget(alt.replace(/\s*\(\d+\)\s*$/, ''));
        const list = this.alts.get(base) ?? [];
        if (!list.includes(e.key)) list.push(e.key);
        this.alts.set(base, list);
      }
    }
  }

  /**
   * Exact key, then the folded key, then singular/plural ("THORNS" → THORN), then the one key that
   * extends it ("COMMANDMENTS" → "COMMANDMENTS, THE TEN", "PILATE" → "PILATE, PONTIUS"); a target
   * that extends to several keys ("BAPTISM") stays unresolved.
   */
  find(target: string): string | null {
    const key = target.replace(/^[A-Za-z]+:/, '').trim();
    const f = foldTarget(key);
    let id = this.exact.get(key) ?? this.exact.get(key.toUpperCase()) ?? this.folded.get(f) ?? null;
    if (!id) {
      // One of the forms of a "A; B" key, or a numbered homonym: "ABSALOM" → "ABSALOM (1)".
      const alts = this.alts.get(f) ?? [];
      const numbered = alts.filter((k) => /\(\d+\)$/.test(k));
      if (alts.length === 1) id = this.exact.get(alts[0])!;
      else if (alts.length > 1 && numbered.length === alts.length) {
        id = this.exact.get(numbered.find((k) => /\(1\)$/.test(k)) ?? numbered[0])!;
      }
    }
    if (!id && f.length > 3) {
      const variants = f.endsWith('ES') ? [f.slice(0, -1), f.slice(0, -2)] : f.endsWith('S') ? [f.slice(0, -1)] : [`${f}S`, `${f}ES`];
      id = variants.map((v) => this.folded.get(v)).find((x) => x) ?? null;
    }
    if (!id && key.length > 3) {
      // The one key that extends the target (or its singular/plural): "PILATE, PONTIUS",
      // "WICKED (PEOPLE)", "AFFLICTIONS AND ADVERSITIES". Commas first, then brackets, then spaces.
      const upper = key.toUpperCase().replace(/[.\s]+$/, '');
      const forms = [upper, upper.endsWith('S') ? upper.slice(0, -1) : `${upper}S`];
      const keys = [...this.exact.keys()];
      for (const sep of [', ', ' (', ' ']) {
        const hits = [...new Set(forms.flatMap((f) => keys.filter((k) => k.startsWith(`${f}${sep}`))))];
        if (hits.length === 1) id = this.exact.get(hits[0])!;
        if (hits.length) break;
      }
    }
    if (id) this.resolved++;
    else this.unresolved.push(target);
    return id;
  }
}

/**
 * True when an entry has no article text: empty, or only an author's signature ("W. Ewing",
 * "James Orr") where the ISBE module lost the article.
 */
export function isEmptyEntry(blocks: Block[]): boolean {
  const text = blocks.map((b) => b.c.map((p) => (typeof p === 'string' ? p : p.t)).join('')).join(' ').trim();
  const linked = blocks.some((b) => b.c.some((p) => typeof p !== 'string' && (p.ref || p.href)));
  return !text || (!linked && /^(?:[A-Z][a-z]*\.?\s){0,3}[A-Z][a-z]+$/.test(text));
}

/** Merges consecutive records with the same key (Easton KADESH, Nave SIN, Smith AB, …). */
export function groupByKey<T extends { key: string }>(records: T[]): T[][] {
  const groups: T[][] = [];
  for (const r of records) {
    const last = groups[groups.length - 1];
    if (last && last[0].key === r.key) last.push(r);
    else groups.push([r]);
  }
  return groups;
}

/** Byte size of an entry inside a bucket file: "id":{…}, */
export function entryBytes(e: DictEntry): number {
  return Buffer.byteLength(JSON.stringify(e)) + Buffer.byteLength(JSON.stringify(e.id)) + 2;
}
