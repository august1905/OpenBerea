// Converts one OSIS verse entry of a SWORD Bible module (KJV, ASV) into the app's Seg[] runs.
//
// KJV markup handled (counts are for KJV v3.1):
//   <w lemma="strong:H07225 …" morph="strongMorph:TH8804 …">  Strong's (s) and morphology (m)
//   <q who="Jesus">            words of Christ (w); always opens and closes within one verse
//   <transChange type="added"> translators' added words, italic in print (a)
//   <divineName>               LORD in small capitals (dn)
//   <milestone type="x-p"/>    ¶ at the start of a verse (original, or subType="x-added")
//   <title type="psalm">       Psalm superscription, inside an x-preverse div at the start of v.1
//   <title type="acrostic">    Ps 119 letter headings (ALEPH, BETH, …)
//   <note>                     translators' marginal notes: dropped
//   <title type="chapter|main">, untyped <title>, <div type="colophon">, milestones: dropped
// ASV additionally uses <div sID type="x-p"/> and <lb type="x-p"/> paragraph milestones,
// <lg>/<l> poetry milestones, and <l type="x-center"/> milestone pairs around Ps 119 headings.
import type { Seg } from '../../../src/lib/data/types';
import { decodeEntities } from './richtext';

export interface Run {
  t: string;
  s?: string[];
  m?: string[];
  w?: 1;
  a?: 1;
  dn?: 1;
}

export interface OsisVerseOptions {
  /** Keep Strong's numbers and morphology (KJV only; ASV tags are misaligned). */
  strongs?: boolean;
}

export interface FinishStats {
  /** Spaces removed before closing punctuation (left behind by dropped notes or empty words). */
  spaceFixes: number;
  /** Spaces inserted between two words that met at an element boundary with no space. */
  joinFixes: number;
}

export interface OsisVerse {
  segs: Seg[];
  /** Title found in this entry (Psalm superscription or Ps 119 acrostic heading). */
  title: Seg[] | null;
  titleType: 'psalm' | 'acrostic' | null;
  /** A paragraph marker comes before the verse text. */
  para: boolean;
  stats: FinishStats & {
    /** <q who="Jesus"> elements. */
    quotes: number;
    /** <w> elements with no text (untranslated words), which are dropped. */
    emptyWords: number;
    notes: number;
    /** Paragraph milestones after the start of the verse text (not representable; ignored). */
    midParagraphs: number;
    /** Text of dropped colophons ("Written to the Romans from Corinthus…"). */
    colophons: string[];
    /** lemma tokens that are not strong:H/G numbers (ignored). */
    badLemmas: string[];
  };
}

/** "strong:H07225" → "H7225", "strong:G25" → "G25"; null for anything else. */
export function strongsFromLemma(token: string): string | null {
  const m = /^strong:([HG])0*(\d+)$/.exec(token);
  return m ? `${m[1]}${Number(m[2])}` : null;
}

/** "strongMorph:TH8804" → "TH8804", "robinson:V-AAI-3S" → "V-AAI-3S". */
export function morphCode(token: string): string {
  const i = token.indexOf(':');
  return i >= 0 ? token.slice(i + 1) : token;
}

export function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = decodeEntities(m[2]);
  return attrs;
}

type Frame = {
  tag: string;
  skip?: boolean;
  title?: 'psalm' | 'acrostic';
  w?: { s?: string[]; m?: string[]; text: boolean };
  a?: 1;
  red?: 1;
  dn?: 1;
};

const PUNCT_AFTER = /^[,.;:?!)\]]/;
const flagsOf = (r: Run) => `${r.w ?? ''}${r.a ?? ''}${r.dn ?? ''}`;

/**
 * Normalizes runs into compact segments: collapses whitespace across runs, removes spaces left
 * before punctuation, inserts a space where two words meet at an element boundary, trims the
 * ends, turns whitespace-only runs into plain strings, merges neighbours with identical flags
 * (when neither carries Strong's or morphology), and omits empty fields.
 */
export function finishRuns(runs: Run[], stats: FinishStats = { spaceFixes: 0, joinFixes: 0 }): Seg[] {
  const out: Run[] = [];
  let lastSpace = true; // the start counts as "after a space", so leading spaces are dropped
  for (const run of runs) {
    let t = run.t.replace(/\s+/g, ' ');
    if (lastSpace && t.startsWith(' ')) t = t.slice(1);
    if (!t) continue;
    const prev = out[out.length - 1];
    if (prev && PUNCT_AFTER.test(t) && prev.t.endsWith(' ')) {
      prev.t = prev.t.slice(0, -1);
      stats.spaceFixes++;
      if (!prev.t) out.pop();
    } else if (prev && /\p{L}$/u.test(prev.t) && /^\p{L}/u.test(t)) {
      out.push({ t: ' ' });
      stats.joinFixes++;
    }
    out.push({ ...run, t });
    lastSpace = t.endsWith(' ');
  }
  const last = out[out.length - 1];
  if (last) {
    last.t = last.t.trimEnd();
    if (!last.t) out.pop();
  }
  const merged: Run[] = [];
  for (const r0 of out) {
    const r: Run = r0.t.trim() ? r0 : { t: r0.t };
    const prev = merged[merged.length - 1];
    if (prev && !prev.s && !prev.m && !r.s && !r.m && flagsOf(prev) === flagsOf(r)) prev.t += r.t;
    else merged.push({ ...r });
  }
  return merged.map((r): Seg => {
    if (!r.s && !r.m && !r.w && !r.a && !r.dn) return r.t;
    const seg: Exclude<Seg, string> = { t: r.t };
    if (r.s?.length) seg.s = r.s;
    if (r.m?.length) seg.m = r.m;
    if (r.w) seg.w = 1;
    if (r.a) seg.a = 1;
    if (r.dn) seg.dn = 1;
    return seg;
  });
}

export function segsToRuns(segs: Seg[]): Run[] {
  return segs.map((s) => (typeof s === 'string' ? { t: s } : { ...s }));
}

/** Joins two segment lists with a space between them. */
export function appendSegs(a: Seg[], b: Seg[]): Seg[] {
  return finishRuns([...segsToRuns(a), { t: ' ' }, ...segsToRuns(b)]);
}

/** Plain text of segments; `upperDivineName` writes divine names as plain-text KJVs do ("LORD"). */
export function segsToText(segs: Seg[], upperDivineName = false): string {
  return segs.map((s) => (typeof s === 'string' ? s : upperDivineName && s.dn ? s.t.toUpperCase() : s.t)).join('');
}

export function parseOsisVerse(osis: string, opts: OsisVerseOptions = {}): OsisVerse {
  const stack: Frame[] = [];
  const verseRuns: Run[] = [];
  const titleRuns: Run[] = [];
  let titleType: OsisVerse['titleType'] = null;
  let para = false;
  let pendingPara = false;
  const stats: OsisVerse['stats'] = {
    quotes: 0, emptyWords: 0, notes: 0, midParagraphs: 0, colophons: [], badLemmas: [], spaceFixes: 0, joinFixes: 0,
  };
  let colophon: string[] | null = null;
  let hasText = false;

  const re = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g;
  for (const m of osis.matchAll(re)) {
    if (m[5] !== undefined) {
      const text = decodeEntities(m[5]);
      if (stack.some((f) => f.skip)) {
        if (colophon && !stack.some((f) => f.tag === 'note')) colophon.push(text);
        continue;
      }
      const run: Run = { t: text };
      let inTitle = false;
      for (const f of stack) {
        if (f.title) inTitle = true;
        if (f.w) {
          if (text.trim()) f.w.text = true;
          if (opts.strongs) {
            if (f.w.s) run.s = f.w.s;
            if (f.w.m) run.m = f.w.m;
          }
        }
        if (f.red) run.w = 1;
        if (f.a) run.a = 1;
        if (f.dn) run.dn = 1;
      }
      if (!inTitle && text.trim()) {
        if (pendingPara) stats.midParagraphs++;
        pendingPara = false;
        hasText = true;
      }
      (inTitle ? titleRuns : verseRuns).push(run);
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2];
    const selfClosing = m[4] === '/';
    const attrs = parseAttrs(m[3]);

    if (closing) {
      const i = stack.map((f) => f.tag).lastIndexOf(tag);
      if (i < 0) continue;
      const [f] = stack.splice(i);
      if (f.w && !f.w.text) stats.emptyWords++;
      if (f.tag === 'div' && f.skip && colophon) {
        stats.colophons.push(colophon.join('').replace(/\s+/g, ' ').trim());
        colophon = null;
      }
      continue;
    }

    if (selfClosing) {
      if (stack.some((f) => f.skip)) continue;
      const isPara =
        ((tag === 'milestone' || tag === 'lb') && attrs.type === 'x-p') || (tag === 'div' && attrs.type === 'x-p' && !!attrs.sID);
      if (isPara) {
        if (!hasText) para = true;
        else pendingPara = true;
      } else if (tag === 'l' && attrs.type === 'x-center') {
        // Milestone pair around a centred heading line (ASV Ps 119 "ב BETH.").
        if (attrs.sID) {
          stack.push({ tag: '#center', title: 'acrostic' });
          titleType = 'acrostic';
        } else {
          const i = stack.map((f) => f.tag).lastIndexOf('#center');
          if (i >= 0) stack.splice(i, 1);
        }
      } else if (tag === 'w') stats.emptyWords++;
      continue;
    }

    const frame: Frame = { tag };
    switch (tag) {
      case 'note':
        frame.skip = true;
        stats.notes++;
        break;
      case 'title':
        if (attrs.type === 'psalm' || attrs.type === 'acrostic') {
          frame.title = attrs.type;
          titleType = attrs.type;
        } else frame.skip = true;
        break;
      case 'div':
        if (attrs.type === 'colophon') {
          frame.skip = true;
          colophon = [];
        }
        break;
      case 'w': {
        const s = (attrs.lemma ?? '')
          .split(/\s+/)
          .filter((x) => x.startsWith('strong:'))
          .map((x) => {
            const id = strongsFromLemma(x);
            if (!id) stats.badLemmas.push(x);
            return id;
          })
          .filter((x): x is string => !!x);
        const morph = (attrs.morph ?? '').split(/\s+/).filter(Boolean).map(morphCode);
        frame.w = { text: false };
        if (s.length) frame.w.s = s;
        if (morph.length) frame.w.m = morph;
        break;
      }
      case 'q':
        if (attrs.who === 'Jesus') {
          frame.red = 1;
          stats.quotes++;
        }
        break;
      case 'transChange':
        if (attrs.type === 'added') frame.a = 1;
        break;
      case 'divineName':
        frame.dn = 1;
        break;
      default:
        // foreign, inscription, abbr, hi, seg, l, lg, rdg, catchWord (inside notes): transparent.
        break;
    }
    stack.push(frame);
  }

  const segs = finishRuns(verseRuns, stats);
  const title = titleRuns.length ? finishRuns(titleRuns, stats) : [];
  return { segs, title: title.length ? title : null, titleType: title.length ? titleType : null, para, stats };
}
