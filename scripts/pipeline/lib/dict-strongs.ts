// Strong's dictionaries → StrongsEntry (strongs/{H|G}/{bucket}.json) and LexIndex rows.
//
// Greek: Ulrik Sandborg-Petersen's "Strong's Greek Dictionary in XML with real Greek" (morphgnt
// strongs-dictionary-xml v1.9, CC0), which marks the derivation, definition and KJV usage and the
// language of every cross-reference. CrossWire StrongsGreek v2.0 (TEI) is parsed only to cross-check
// lemma, pronunciation and KJV usage (it lacks 34 entries and carries Chinese notes in 53).
// Hebrew: CrossWire StrongsHebrew v1.2 (plain text: definition, KJV usage, pronunciation) with the
// Hebrew script and transliteration of StrongsHebrew v3.0 (TEI, Jens Grebner's text).
import type { Block, Inline, StrongsEntry } from '../../../src/lib/data/types';
import { RefLinker } from './dict-refs';
import { decodeEntities, normalizeInlines } from './richtext';

// ---------------------------------------------------------------------------------------------
// Shared text helpers

/** Splits at the first separator that is outside parentheses and brackets. */
export function splitTopLevel(text: string, sep: RegExp): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const m = sep.exec(text.slice(i));
      if (m && m.index === 0) return [text.slice(0, i), text.slice(i + m[0].length)];
    }
  }
  return null;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Drops closing brackets that have no opening one ("remote application):--" in StrongsHebrew H1). */
export function balanceParens(s: string): string {
  let depth = 0;
  let out = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (!depth) continue;
      depth--;
    }
    out += ch;
  }
  return out;
}

/** Removes accents from a Latin transliteration but keeps macrons and diaereses: "agapáō" → "agapaō". */
export function plainTranslit(s: string): string {
  return s.normalize('NFD').replace(/[\u0300\u0301\u0302\u0342\u0313\u0314]/g, '').normalize('NFC');
}

/** Text of inlines. */
export function inlineText(c: Inline[]): string {
  return c.map((p) => (typeof p === 'string' ? p : p.t)).join('');
}

function trimInlines(c: Inline[], trailing = /[\s;,:]+$/, leading = /^[\s;,:]+/): Inline[] {
  const out = normalizeInlines(c);
  if (!out.length) return out;
  const first = out[0];
  if (typeof first === 'string') out[0] = first.replace(leading, '');
  else if (!first.s && !first.ref) out[0] = { ...first, t: first.t.replace(leading, '') };
  const li = out.length - 1;
  const last = out[li];
  if (typeof last === 'string') out[li] = last.replace(trailing, '');
  else if (!last.s && !last.ref) out[li] = { ...last, t: last.t.replace(trailing, '') };
  return out.filter((p) => (typeof p === 'string' ? p : p.t));
}

/** Plain text with Scripture references linked (book names only: Strong's has no context refs). */
function proseInlines(text: string, linker: RefLinker): Inline[] {
  return linker.prose(text).map((p) => (p.ref ? { t: p.t, ref: p.ref } : p.t));
}

/**
 * Short gloss for the index: the first sense of the definition (up to the first top-level ";"),
 * under 60 characters; the first KJV rendering when there is no definition.
 */
export function shortGloss(def: string, kjv?: string): string {
  let g = squash(def).replace(/^(?:properly|literally|figuratively|i\.e\.|by implication),?\s+/i, '');
  g = (splitTopLevel(g, /;\s*/)?.[0] ?? g).replace(/[\s,:;.]+$/, '');
  if (!g && kjv) g = (splitTopLevel(kjv, /,\s*/)?.[0] ?? kjv).replace(/^[X+]\s+/, '').trim();
  if (g.length >= 60) g = g.replace(/\s*\([^()]*\)/g, '').trim();
  if (g.length >= 60) g = (splitTopLevel(g, /,\s*/)?.[0] ?? g).trim();
  if (g.length >= 60) g = `${g.slice(0, 58).replace(/\s+\S*$/, '')}…`;
  return g;
}

/** Strong's numbers of the `s` links in inlines, unique, in order. */
export function strongsLinks(c: Inline[]): string[] {
  const out: string[] = [];
  for (const p of c) if (typeof p !== 'string' && p.s && !out.includes(p.s)) out.push(p.s);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Greek: morphgnt strongsgreek.xml

export interface MorphgntEntry {
  n: number;
  /** Markup before the derivation/definition: <strongs>, <greek/>, <pronunciation/>, alternate forms. */
  head: string;
  deriv?: string;
  def?: string;
  kjv?: string;
  /** Text after </kjv_def> ("Compare <strongsref …/>."). */
  tail?: string;
}

/** Entries of strongsgreek.xml by number. */
export function parseMorphgntXml(xml: string): Map<number, MorphgntEntry> {
  const out = new Map<number, MorphgntEntry>();
  for (const m of xml.matchAll(/<entry strongs="(\d+)">([\s\S]*?)<\/entry>/g)) {
    const body = m[2];
    const part = (tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body)?.[1];
    const first = body.search(/<strongs_derivation>|<strongs_def>|<kjv_def>/);
    const kjvEnd = body.lastIndexOf('</kjv_def>');
    const e: MorphgntEntry = { n: Number(m[1]), head: first < 0 ? body : body.slice(0, first) };
    const deriv = part('strongs_derivation');
    const def = part('strongs_def');
    const kjv = part('kjv_def');
    if (deriv !== undefined) e.deriv = deriv;
    if (def !== undefined) e.def = def;
    if (kjv !== undefined) e.kjv = kjv;
    if (kjvEnd >= 0 && body.slice(kjvEnd + 10).trim()) e.tail = body.slice(kjvEnd + 10);
    out.set(e.n, e);
  }
  return out;
}

function xmlAttr(attrs: string, name: string): string {
  return decodeEntities(new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? '');
}

/** Inlines of a morphgnt fragment: Greek words, Strong's links (G/H from the language attribute), Latin. */
export function morphgntInlines(fragment: string, linker: RefLinker): Inline[] {
  const out: Inline[] = [];
  for (const m of fragment.matchAll(/<(greek|strongsref|pronunciation)\b([^>]*)\/>|<latin>([\s\S]*?)<\/latin>|<strongs>[\s\S]*?<\/strongs>|<[^>]*>|([^<]+)/g)) {
    if (m[1] === 'greek') out.push({ t: xmlAttr(m[2], 'unicode'), l: 'grc' });
    else if (m[1] === 'strongsref') {
      const id = `${xmlAttr(m[2], 'language') === 'HEBREW' ? 'H' : 'G'}${Number(xmlAttr(m[2], 'strongs'))}`;
      out.push({ t: id, s: id });
    } else if (m[1] === 'pronunciation') out.push({ t: xmlAttr(m[2], 'strongs'), i: 1 });
    else if (m[3] !== undefined) out.push({ t: decodeEntities(m[3]), i: 1 });
    else if (m[4] !== undefined) out.push(...proseInlines(decodeEntities(m[4]), linker));
  }
  return out;
}

/**
 * The alternate forms in an entry head after the headword: "or ἐθέλω (ethelō, eth-el'-o), in
 * certain tenses θελέω (theleō, thel-eh'-o), …".
 */
function formsNote(head: string): Inline[] {
  const afterFirst = head.replace(/^[\s\S]*?<greek\b[^>]*\/>\s*(?:<pronunciation\b[^>]*\/>)?/, '');
  const out: Inline[] = [];
  for (const m of afterFirst.matchAll(/<greek\b([^>]*)\/>(?:\s*<pronunciation\b([^>]*)\/>)?|<[^>]*>|([^<]+)/g)) {
    if (m[1] !== undefined) {
      const tr = plainTranslit(xmlAttr(m[1], 'translit'));
      const pron = m[2] !== undefined ? xmlAttr(m[2], 'strongs') : '';
      out.push({ t: xmlAttr(m[1], 'unicode'), l: 'grc' }, ` (${[tr, pron].filter(Boolean).join(', ')})`);
    } else if (m[3] !== undefined) out.push(decodeEntities(m[3]));
  }
  const c = trimInlines(out);
  return c.some((p) => typeof p !== 'string') ? c : [];
}

/** True for the numbers Strong's skipped ("Not Used": 2717, 3203–3302). */
export function isUnusedGreek(e: MorphgntEntry): boolean {
  return /Not\s+Used/i.test(e.head.replace(/<[^>]*>/g, '')) && e.def === undefined;
}

export const UNUSED_NOTE = 'This number is not used in Strong’s dictionary.';

export interface Converted {
  entry: StrongsEntry;
  /** Short gloss for strongs/index.json. */
  gloss: string;
}

export function greekEntry(e: MorphgntEntry, linker = new RefLinker('', false)): Converted {
  const id = `G${e.n}`;
  if (isUnusedGreek(e)) return { entry: { id, lemma: '', x: '', def: [{ k: 'p', c: [UNUSED_NOTE] }] }, gloss: '(not used)' };
  const greek = /<greek\b([^>]*)\/>/.exec(e.head);
  const pron = /<pronunciation\b([^>]*)\/>/.exec(e.head);
  const entry: StrongsEntry = {
    id,
    lemma: greek ? xmlAttr(greek[1], 'unicode').normalize('NFC') : '',
    x: greek ? plainTranslit(xmlAttr(greek[1], 'translit')) : '',
    def: [],
  };
  if (pron) entry.pron = xmlAttr(pron[1], 'strongs').trim();
  if (e.deriv !== undefined) {
    const deriv = trimInlines(morphgntInlines(e.deriv, linker));
    if (deriv.length) {
      entry.deriv = deriv;
      const roots = strongsLinks(deriv);
      if (roots.length) entry.roots = roots;
    }
  }
  const forms = formsNote(e.head);
  if (forms.length) entry.def.push({ k: 'p', c: forms });
  const def = trimInlines(morphgntInlines(e.def ?? '', linker));
  if (def.length) entry.def.push({ k: 'p', c: def });
  const tail = trimInlines(morphgntInlines(e.tail ?? '', linker), /\s+$/);
  if (tail.length) entry.def.push({ k: 'p', c: tail });
  if (e.kjv !== undefined) {
    const kjv = squash(inlineText(morphgntInlines(e.kjv, linker))).replace(/^[:\s]*-+\s*/, '').replace(/\.$/, '').trim();
    if (kjv) entry.kjv = kjv;
  }
  return { entry, gloss: shortGloss(inlineText(def), entry.kjv) };
}

// ---------------------------------------------------------------------------------------------
// Greek cross-check: CrossWire StrongsGreek v2.0 TEI

export interface CrossWireGreek {
  lemma: string;
  x: string;
  pron?: string;
  kjv?: string;
}

/** Headword, transliteration, pronunciation and KJV usage of a StrongsGreek v2.0 entry. */
export function parseCrossWireGreek(tei: string): CrossWireGreek {
  const orth = /<orth>([\s\S]*?)<\/orth>/.exec(tei)?.[1] ?? '';
  const trans = /<orth[^>]*type="trans"[^>]*>([\s\S]*?)<\/orth>/.exec(tei)?.[1] ?? '';
  const pron = /<pron[^>]*>\s*\{([^}]*)\}/.exec(tei)?.[1];
  const def = (/<def>([\s\S]*?)<\/def>/.exec(tei)?.[1] ?? '').replace(/<lb\/>\s*see (?:GREEK|HEBREW) for \d+[a-z]?/g, '');
  const kjvPart = splitTopLevel(squash(decodeEntities(def)), /:?\s*--/)?.[1];
  const out: CrossWireGreek = {
    lemma: squash(decodeEntities(orth)).split(' ')[0].normalize('NFC'),
    x: squash(decodeEntities(trans)),
  };
  if (pron) out.pron = pron.trim();
  if (kjvPart) out.kjv = (splitTopLevel(kjvPart, /\.\s+(?=[A-Z])/)?.[0] ?? kjvPart).replace(/\.$/, '').trim();
  return out;
}

// ---------------------------------------------------------------------------------------------
// Hebrew: StrongsHebrew v1.2 (text) + v3.0 (Hebrew script)

export interface HebrewMain {
  n: number;
  /** ASCII transliteration from the first line ("'elohiym"). */
  translit: string;
  pron: string;
  /** Definition text: everything after the first line except the "see HEBREW for" lines. */
  body: string;
  /** Strong's numbers listed in the "see HEBREW for N" / "see GREEK for N" lines. */
  refs: string[];
}

/**
 * Parses a StrongsHebrew v1.2 record: " 430  'elohiym  el-o-heem'", blank line, the text, and
 * "see HEBREW for 0433" lines.
 */
export function parseHebrewMain(text: string): HebrewMain | null {
  const lines = text.replace(/\r/g, '').split('\n');
  const head = /^\s*(\d+)\s{2,}(\S.*?)\s{2,}(\S.*)$/.exec(lines[0] ?? '');
  if (!head) return null;
  const refs: string[] = [];
  const body: string[] = [];
  for (const l of lines.slice(1)) {
    const see = /^\s*see (HEBREW|GREEK) for 0*(\d+)\s*$/.exec(l);
    if (see) refs.push(`${see[1] === 'GREEK' ? 'G' : 'H'}${see[2]}`);
    else body.push(l);
  }
  const pron = head[3].split(/;|\s\{/)[0].trim();
  return {
    n: Number(head[1]),
    translit: head[2].trim(),
    pron,
    body: squash(body.join(' ').replace(/&Š\s*/g, '')),
    refs,
  };
}

export interface HebrewBeta {
  /** Hebrew forms of the headword (the first is the lemma). */
  forms: string[];
  /** Transliterations, parallel to forms where the module gives one per form. */
  x: string[];
  pron: string;
}

/** Headword forms (Hebrew script) and transliterations of a StrongsHebrew v3.0 TEI entry. */
export function parseHebrewBeta(tei: string): HebrewBeta {
  const clean = (s: string) =>
    decodeEntities(s.replace(/<hi rend="super">e<\/hi>/g, 'ᵉ').replace(/<[^>]*>/g, '')).normalize('NFC');
  const orth = /<orth>([\s\S]*?)<\/orth>/.exec(tei)?.[1] ?? '';
  const trans = /<orth[^>]*type="trans"[^>]*>([\s\S]*?)<\/orth>/.exec(tei)?.[1] ?? '';
  const pron = /<pron[^>]*>([\s\S]*?)<\/pron>/.exec(tei)?.[1] ?? '';
  const split = (s: string) => clean(s).trim().split(/\s{2,}/).map((f) => f.trim()).filter(Boolean);
  return {
    // Multiple Hebrew forms are stored right-to-left, i.e. in the reverse order of their
    // transliterations and of the v1.2 headword (H26 "אביגל  אביגיל" = 'ăbîygayil, 'ăbîygal).
    forms: split(orth).map((f) => f.replace(/[^\u0590-\u05ff\ufb1d-\ufb4f\s\u05be]/g, '').trim()).filter(Boolean).reverse(),
    x: split(trans),
    pron: clean(pron).replace(/[{}]/g, '').trim(),
  };
}

// Strong's derivation clauses ("a primitive root", "from 1 and 1391", "(Aramaic) corresponding to").
const DERIVATION =
  /^(?:\((?:Aramaic|Chaldee|Chald)\.?\)\s*)?(?:(?:properly|apparently|appar|probably|prob|perhaps|either|once),?\.?\s+)?(?:patrial|partrial|patronymic(?:ally)?|plur\.?\b|plural|fem\.?\b|feminine|masc\.?\b|masculine|dual|multiple|a numeral|an? abbrev|abbreviated|by (?:an? )?(?:orthographical|variation|euphonism|permutation|transposition|contraction|reduplication|implication)|prolongation|prolonged|corresp|corresponding|a primitive|a primary|primary|from\b|as if from|of (?:\(?\w+\)? )?(?:foreign|uncertain|Egyptian|Persian|Pers|Hebrew|Chaldee|Aramaic|Latin|Greek|Arabic|Phoenician|Assyrian|Babylonian|Median|Syrian|Philistine|Moabite|Ethiopian|Coptic|Canaanitish)\b|the same as|same as|identical|for\b|a form|an? (?:collateral|orthographical|incorrect|unused|variation|modification|denominative|prolonged|primitive|root|clerical|negative|demonstrative|interrogative|prepositional)|contracted|intensive|causative|denominative|passive|active|middle voice|the base of|another form|a root|reduplicated|lengthened|shortened|strengthened|softened|compare|in the sense of|neuter|comparative|superlative|adverb|imperative|a (?:particle|derivative|Persian|Chaldee|foreign)|borrowed|formed|akin|in form|collateral|past participle|participle|respectively)/i;

/** All top-level parts of a text split at a separator. */
function splitAll(text: string, sep: RegExp): string[] {
  const out: string[] = [];
  let rest = text;
  for (let s = splitTopLevel(rest, sep); s; s = splitTopLevel(rest, sep)) {
    out.push(s[0]);
    rest = s[1];
  }
  out.push(rest);
  return out.map((p) => p.trim()).filter(Boolean);
}

const FORMS_START = /^(?:\((?:Aramaic|Chaldee|feminine|masculine)\)\s*)?(?:or|also|rarely|and|sometimes|in pause|once|original)\b|^\((?:but|also|or|sometimes|masculine|only|Zech|Jer)\b/i;

/**
 * Splits Strong's text into forms note, derivation, definition, KJV usage and trailing note. The
 * derivation is the first ";" part that reads like one or names one of the record's Strong's
 * numbers (`refs`); parts before it that list other spellings ("or shorter Abiygal {…}") are the
 * forms note.
 */
export function splitStrongsText(text: string, refs: string[] = []): { forms?: string; deriv?: string; def: string; kjv?: string; tail?: string } {
  // "(as in the margin}" (H726): a bracket closed by a brace.
  let rest = squash(text)
    .replace(/^[\s:;,]+/, '')
    .replace(/\(([^(){}]*)\}/g, '($1)')
    .replace(/\{([^(){}]*)\)/g, '{$1}');
  let kjv: string | undefined;
  let tail: string | undefined;
  // The KJV usage follows the first "--" (never inside brackets in Strong's).
  const dash = /:?\s*--+\s*/.exec(rest);
  const k: [string, string] | null = dash ? [rest.slice(0, dash.index), rest.slice(dash.index + dash[0].length)] : null;
  if (k) {
    rest = k[0];
    const t = splitTopLevel(k[1], /\.\s+(?=[A-Z"(])/);
    kjv = (t ? t[0] : k[1]).replace(/\.\s*$/, '').trim();
    if (t && t[1].trim()) tail = t[1].trim();
  }
  const numbers = new Set(refs.map((r) => r.slice(1)));
  const isDeriv = (p: string) =>
    DERIVATION.test(p) || [...p.matchAll(/\b0*(\d{1,4})\b/g)].some((m) => numbers.has(m[1]));
  const parts = splitAll(rest, /;\s*/);
  let i = 0;
  let forms: string | undefined;
  if (parts.length > 1 && FORMS_START.test(parts[0])) {
    const j = parts.findIndex((p, n) => n >= 1 && isDeriv(p));
    i = j > 0 ? j : 1;
    forms = parts.slice(0, i).join('; ');
  }
  let deriv: string | undefined;
  if (i < parts.length && isDeriv(parts[i]) && (parts.length > i + 1 || (kjv !== undefined && parts[i].split(/\s+/).length <= 8))) {
    deriv = parts[i];
    i++;
  }
  let def = parts.slice(i).join('; ');
  const root = !deriv ? /^(a primitive (?:root|word|particle))[,:]\s+/i.exec(def) : null;
  if (root) {
    deriv = root[1];
    def = def.slice(root[0].length);
  }
  const out: { forms?: string; deriv?: string; def: string; kjv?: string; tail?: string } = {
    def: def.replace(/^[\s;,]+|[\s;,:]+$/g, ''),
  };
  if (forms) out.forms = forms.trim();
  if (deriv) out.deriv = deriv.replace(/[\s;,]+$/, '');
  if (kjv) out.kjv = kjv;
  if (tail) out.tail = tail;
  return out;
}

/**
 * Inlines of Strong's Hebrew text. Scripture references are linked first; then a number becomes an
 * H link when the record's "see HEBREW for" lines list it, or when it follows a derivation word
 * ("from 1 and 2428": the lines miss 13 such numbers split across a line break). Pronunciations in
 * braces become parentheses.
 */
export function hebrewInlines(text: string, refs: string[], linker: RefLinker, max = 8674): Inline[] {
  const out: Inline[] = [];
  const listed = new Set(refs);
  // Braces mark pronunciations ("Abiygal {ab-ee-gal'}"); unpaired ones are typos (H2518 "{Chilhijah").
  const t = text.replace(/\{([^{}]*)\}/g, '($1)').replace(/[{}]/g, '');
  for (const piece of proseInlines(t, linker)) {
    if (typeof piece !== 'string') {
      out.push(piece);
      continue;
    }
    let last = 0;
    for (const m of piece.matchAll(/\b0*(\d{1,4})\b/g)) {
      const before = piece.slice(0, m.index);
      const after = piece.slice(m.index + m[0].length);
      const h = `H${m[1]}`;
      const g = `G${m[1]}`;
      const derivWord = /\b(?:from|of|and|to|with|compare|comp\.|see|akin|for|by|or|than)\s+$/i.test(before);
      const id = listed.has(h) ? h : listed.has(g) ? g : derivWord && Number(m[1]) <= max ? h : null;
      if (!id || /[:.]\d*$/.test(before) || /^\s*:\d|^\s*[A-Z][a-z]/.test(after)) continue;
      if (m.index > last) out.push(piece.slice(last, m.index));
      out.push({ t: id, s: id });
      last = m.index + m[0].length;
    }
    if (last < piece.length) out.push(piece.slice(last));
  }
  return out;
}

export function hebrewEntry(main: HebrewMain, beta: HebrewBeta | null, linker = new RefLinker('', false)): Converted {
  const parts = splitStrongsText(balanceParens(main.body), main.refs);
  const entry: StrongsEntry = {
    id: `H${main.n}`,
    lemma: beta?.forms[0] ?? '',
    x: beta?.x[0] ?? main.translit,
    def: [],
  };
  const pron = main.pron || beta?.pron;
  if (pron) entry.pron = pron;
  if (parts.deriv) {
    const deriv = trimInlines(hebrewInlines(parts.deriv, main.refs, linker));
    if (deriv.length) {
      entry.deriv = deriv;
      const roots = strongsLinks(deriv);
      if (roots.length) entry.roots = roots;
    }
  }
  const blocks: Block[] = [];
  // Other spellings: in Hebrew script from v3.0 when it has them, else v1.2's "or …" clause.
  if (beta && beta.forms.length > 1) {
    const c: Inline[] = ['Also written '];
    beta.forms.slice(1).forEach((f, i) => {
      if (i) c.push(', ');
      c.push({ t: f, l: 'hbo' });
      const x = beta.x[i + 1];
      if (x && x !== beta.x[0]) c.push(` (${x})`);
    });
    blocks.push({ k: 'p', c });
  } else if (parts.forms) blocks.push({ k: 'p', c: trimInlines(hebrewInlines(parts.forms, main.refs, linker)) });
  const def = parts.def ? trimInlines(hebrewInlines(parts.def, main.refs, linker)) : [];
  if (def.length) blocks.push({ k: 'p', c: def });
  if (parts.tail) blocks.push({ k: 'p', c: trimInlines(hebrewInlines(parts.tail, main.refs, linker), /\s+$/) });
  entry.def = blocks.filter((b) => b.c.length);
  if (parts.kjv) entry.kjv = parts.kjv;
  return { entry, gloss: shortGloss(inlineText(def), entry.kjv) };
}
