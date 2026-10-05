// Strong's numbers for the ASV, carried over word by word from the KJV.
//
// The CrossWire ASV module's own tags put a number on almost every word, but the number often
// belongs to a neighbouring word ("In" H430, "the" H853, "is" H3068), so they are not used. The ASV
// is a light revision of the KJV, so each ASV verse is aligned to the KJV verse instead:
//   same      the identical word: phrases of 3+ words the ASV moved, then a longest common
//             subsequence of the other words, preferring unbroken runs (the KJV's small-caps LORD/GOD
//             reads as "Jehovah", as the ASV prints it);
//   similar   inside a gap between identical words, a respelling ("honour"/"honor", "heaven"/"heavens",
//             "any thing"/"anything") or a systematic ASV substitution ("Ghost"/"Spirit", "which"/"who");
//   position  a gap of exactly one KJV word and one ASV word ("tabernacle"/"tent"), unless one is a
//             function word ("and", "the", "she") and the other is not.
// An ASV word takes the Strong's numbers and morphology of the KJV <w> phrase it was matched to, and
// neighbouring words from the same phrase form one tappable segment, as in the KJV. Everything else
// stays untagged: words the ASV adds or rewords beyond a one-for-one swap, and words it prints in
// italics (translators' additions).
import type { Seg } from '../../../src/lib/data/types';

/** One KJV <w> element: its Strong's numbers and morphology. */
export interface TagUnit {
  s: string[];
  m?: string[];
}

export interface VerseWord {
  /** The word as printed. */
  t: string;
  /** Normalized for comparison: lower case, no apostrophes or hyphens; KJV small-caps LORD → "jehovah". */
  n: string;
  start: number;
  end: number;
  /** Index into `units`, or -1 when the word is not inside a tagged element. */
  unit: number;
  /** Printed in italics (translators' addition). */
  a: boolean;
}

export type Rule = 'same' | 'similar' | 'position';
export const RULES: Rule[] = ['same', 'similar', 'position'];

// The KJV joins names with an en dash ("Beth–el"), the ASV with a hyphen ("Beth-el").
const WORD = /[\p{L}\p{N}]+(?:['’\-–][\p{L}\p{N}]+)*/gu;

export function normWord(w: string, divineName = false): string {
  const n = w.toLowerCase().replace(/['’\-–]/g, '');
  return divineName ? n.replace(/^(lord|god|jah|jehovah)(s?)$/, 'jehovah$2') : n;
}

/**
 * Words of a verse, each with the tagged element it belongs to. Adjacent segments with the same
 * numbers that differ only in small caps or italics are one element ("the " + "LORD"), as in the
 * module. A word whose letters span two elements counts as untagged.
 */
export function verseWords(segs: Seg[]): { text: string; words: VerseWord[]; units: TagUnit[] } {
  let text = '';
  const unitAt: number[] = [];
  const italicAt: boolean[] = [];
  const dnAt: boolean[] = [];
  const units: TagUnit[] = [];
  let prev: Seg | null = null;
  for (const s of segs) {
    let u = -1;
    if (typeof s !== 'string' && s.s?.length) {
      const p = prev && typeof prev !== 'string' ? prev : null;
      const sameWord = p?.s && p.s.join() === s.s.join() && (!!p.dn !== !!s.dn || !!p.a !== !!s.a);
      if (!sameWord) units.push(s.m ? { s: s.s, m: s.m } : { s: s.s });
      u = units.length - 1;
    }
    const t = typeof s === 'string' ? s : s.t;
    for (let i = 0; i < t.length; i++) {
      unitAt.push(u);
      italicAt.push(typeof s !== 'string' && !!s.a);
      // Small caps marks the divine name in the Old Testament (the NT's few are "Lord", G2962).
      dnAt.push(typeof s !== 'string' && !!s.dn && u >= 0 && units[u].s.some((x) => x[0] === 'H'));
    }
    text += t;
    prev = s;
  }
  const words: VerseWord[] = [];
  for (const m of text.matchAll(WORD)) {
    const start = m.index;
    const end = start + m[0].length;
    const span = new Set(unitAt.slice(start, end));
    words.push({
      t: m[0],
      n: normWord(m[0], dnAt.slice(start, end).some(Boolean)),
      start,
      end,
      unit: span.size === 1 ? [...span][0] : -1,
      a: italicAt.slice(start, end).some(Boolean),
    });
  }
  return { text, words, units };
}

/**
 * Index pairs of a longest common subsequence of a and b under `eq`. Among equally long ones it
 * takes the one with the most adjacent pairs, so "the heaven" matches as a run rather than pairing
 * "the" with an earlier "the".
 */
export function lcsPairs<A, B>(a: A[], b: B[], eq: (x: A, y: B) => boolean): [number, number][] {
  const w = b.length + 1;
  // best[p][i * w + j]: score of a[i..], b[j..] when a[i - 1] and b[j - 1] were matched (p = 1) or not.
  // Score = 1024 per pair + 1 per pair that follows a pair, so length always comes first.
  const best = [new Int32Array((a.length + 1) * w), new Int32Array((a.length + 1) * w)];
  const same = (i: number, j: number) => eq(a[i], b[j]);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const skip = Math.max(best[0][(i + 1) * w + j], best[0][i * w + j + 1]);
      const take = same(i, j) ? 1024 + best[1][(i + 1) * w + j + 1] : -1;
      best[0][i * w + j] = Math.max(skip, take);
      best[1][i * w + j] = Math.max(skip, take < 0 ? -1 : take + 1);
    }
  }
  const out: [number, number][] = [];
  let p = 0;
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    const here = best[p][i * w + j];
    if (same(i, j) && here === 1024 + p + best[1][(i + 1) * w + j + 1]) {
      out.push([i++, j++]);
      p = 1;
    } else {
      if (best[0][(i + 1) * w + j] === here) i++;
      else j++;
      p = 0;
    }
  }
  return out;
}

/**
 * Systematic ASV substitutions for a KJV word, used to line words up inside a gap (a lone
 * one-for-one swap is matched by position anyway). Each was checked against the KJV/ASV word pairs
 * the alignment finds.
 */
const SWAPS: Record<string, string[]> = {
  which: ['who', 'that', 'whom'],
  that: ['which', 'who'],
  who: ['that', 'which'],
  thine: ['thy'],
  mine: ['my'],
  shall: ['will'],
  shalt: ['wilt'],
  an: ['a'],
  his: ['its'],
  her: ['its'],
  ghost: ['spirit'],
  tabernacle: ['tent'],
  heathen: ['nations'],
  gentiles: ['nations'],
  mercy: ['lovingkindness'],
  congregation: ['assembly'],
  meat: ['food'],
  corn: ['grain'],
  pitched: ['encamped'],
  fowls: ['birds'],
  children: ['sons'],
  judgment: ['justice'],
  judgments: ['ordinances'],
  stranger: ['sojourner'],
  strangers: ['sojourners'],
  devil: ['demon'],
  devils: ['demons'],
  coast: ['border'],
  coasts: ['borders'],
  sepulchre: ['tomb'],
  hell: ['sheol'],
  shittim: ['acacia'],
  charity: ['love'],
  elias: ['elijah'],
  esaias: ['isaiah'],
  vail: ['veil'],
  fenced: ['fortified'],
  enemies: ['adversaries'],
  doctrine: ['teaching'],
};

/** "honour"/"honor", "shew"/"show", "Judæa"/"Judea", "cherubims"/"cherubim": spelling only. */
function respell(n: string): string {
  return n
    .replace(/æ/g, 'e')
    .replace(/our(?=s?$|able|ed|ing|eth|est|ers?$)/, 'or')
    .replace(/^shew/, 'show')
    .replace(/^enqui/, 'inqui')
    .replace(/ims$/, 'im');
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** The ASV word `a` is the KJV word `k` respelled, inflected, or systematically replaced. */
export function similarWords(k: string, a: string): boolean {
  if (k === a || SWAPS[k]?.includes(a)) return true;
  const rk = respell(k);
  const ra = respell(a);
  if (rk === ra) return true;
  const [s, l] = rk.length <= ra.length ? [rk, ra] : [ra, rk];
  // Inflection: "heaven"/"heavens", "lift"/"lifted", "burn"/"burning"; not "the"/"then".
  if (l.startsWith(s) && (s.length >= 4 ? l.length - s.length <= 3 : s.length === 3 && /^e?s$/.test(l.slice(3)))) return true;
  // Respelled by one letter: "Maachah"/"Maacah", "Zidon"/"Sidon", "morter"/"mortar".
  return s.length >= 5 && editDistanceAtMost1(rk, ra);
}

/** A run of 1–3 words read as one ("any thing" for the ASV's "anything"). */
interface Span {
  i: number;
  n: number;
  key: string;
}

/** Words from..to as spans, joining 2–3 words whose letters spell a single word of the other side. */
function spans(words: VerseWord[], from: number, to: number, other: Set<string>): Span[] {
  const out: Span[] = [];
  for (let i = from; i < to; ) {
    let n = 1;
    for (const len of [3, 2]) {
      if (i + len > to) continue;
      const joined = respell(words.slice(i, i + len).map((w) => w.n).join(''));
      if (other.has(joined)) {
        n = len;
        break;
      }
    }
    out.push({ i, n, key: words.slice(i, i + n).map((w) => w.n).join('') });
    i += n;
  }
  return out;
}

export interface WordMatch {
  /** Index of the KJV word whose element the ASV word takes. */
  k: number;
  rule: Rule;
}

/**
 * Phrases of 3 or more words that the ASV moved ("to them that love God" in Rom 8:28): runs of
 * ASV words left out of the in-order alignment that occur word for word elsewhere in the KJV verse.
 * Returned as [kjvStart, asvStart, length], longest first.
 */
export function movedPhrases(kjv: VerseWord[], asv: VerseWord[]): [number, number, number][] {
  const pairs = lcsPairs(kjv, asv, (x, y) => x.n === y.n);
  const inOrderA = new Set(pairs.map(([, j]) => j));
  const inOrderK = new Set(pairs.map(([i]) => i));
  const usedK = new Set<number>();
  const out: [number, number, number][] = [];
  for (let j = 0; j < asv.length; j++) {
    if (inOrderA.has(j)) continue;
    let best: [number, number, number] | null = null;
    let bestCost = 0;
    for (let i = 0; i < kjv.length; i++) {
      let n = 0;
      while (j + n < asv.length && !inOrderA.has(j + n) && i + n < kjv.length && !usedK.has(i + n) && kjv[i + n].n === asv[j + n].n) n++;
      // Longest first; then the occurrence that takes the fewest words already matched in order.
      let cost = 0;
      for (let x = i; x < i + n; x++) if (inOrderK.has(x)) cost++;
      if (n >= 3 && (!best || n > best[2] || (n === best[2] && cost < bestCost))) {
        best = [i, j, n];
        bestCost = cost;
      }
    }
    if (!best) continue;
    out.push(best);
    for (let x = best[0]; x < best[0] + best[2]; x++) usedK.add(x);
    j += best[2] - 1;
  }
  return out;
}

/** For each ASV word, the KJV word it takes its numbers from and how it was matched. */
export function alignWords(kjv: VerseWord[], asv: VerseWord[]): (WordMatch | null)[] {
  const out: (WordMatch | null)[] = asv.map(() => null);
  const movedK = new Set<number>();
  const movedA = new Set<number>();
  for (const [i, j, n] of movedPhrases(kjv, asv)) {
    for (let x = 0; x < n; x++) {
      out[j + x] = { k: i + x, rule: 'same' };
      movedK.add(i + x);
      movedA.add(j + x);
    }
  }
  // Everything else in order, without the moved phrases.
  const ki = kjv.map((_, i) => i).filter((i) => !movedK.has(i));
  const ai = asv.map((_, j) => j).filter((j) => !movedA.has(j));
  alignInOrder(
    ki.map((i) => kjv[i]),
    ai.map((j) => asv[j]),
  ).forEach((m, x) => {
    if (m) out[ai[x]] = { k: ki[m.k], rule: m.rule };
  });
  return out;
}

function alignInOrder(kjv: VerseWord[], asv: VerseWord[]): (WordMatch | null)[] {
  const out: (WordMatch | null)[] = asv.map(() => null);
  // Matched ranges as [kStart, kEnd, aStart, aEnd); the gaps between them are filled afterwards.
  const anchors: [number, number, number, number][] = [[-1, 0, -1, 0]];
  for (const [i, j] of lcsPairs(kjv, asv, (x, y) => x.n === y.n)) {
    out[j] = { k: i, rule: 'same' };
    anchors.push([i, i + 1, j, j + 1]);
  }
  anchors.push([kjv.length, kjv.length + 1, asv.length, asv.length + 1]);
  const ranges: [number, number, number, number][] = [anchors[0]];
  for (let g = 1; g < anchors.length; g++) {
    const k0 = anchors[g - 1][1];
    const a0 = anchors[g - 1][3];
    const [k1, , a1] = anchors[g];
    if (k1 > k0 && a1 > a0) {
      // Respellings and substitutions inside the gap, including words written as one or two.
      const ks = spans(kjv, k0, k1, new Set(asv.slice(a0, a1).map((w) => respell(w.n))));
      const as = spans(asv, a0, a1, new Set(kjv.slice(k0, k1).map((w) => respell(w.n))));
      for (const [x, y] of lcsPairs(ks, as, (p, q) => similarWords(p.key, q.key))) {
        const k = ks[x];
        const a = as[y];
        const unit = kjv[k.i].unit;
        if (kjv.slice(k.i, k.i + k.n).every((w) => w.unit === unit)) {
          for (let j = a.i; j < a.i + a.n; j++) out[j] = { k: k.i, rule: 'similar' };
        }
        ranges.push([k.i, k.i + k.n, a.i, a.i + a.n]);
      }
    }
    ranges.push(anchors[g]);
  }
  for (let r = 1; r < ranges.length; r++) fillGap(kjv, asv, out, ranges[r - 1], ranges[r]);
  return out;
}

/** Articles, pronouns, conjunctions, prepositions, auxiliaries, and other short grammatical words. */
const FUNCTION_WORDS = new Set(
  (
    'a an the and but or nor for so yet then now also even yea if though although because lest that which who whom ' +
    'whose what whatsoever whosoever this these those there here thereof therein wherein whereof whereby i me my mine ' +
    'we us our ours thou thee thy thine ye you your yours he him his she her hers it its they them their theirs one ' +
    'not no neither never of to in into on upon unto at by with from through over under after before about against ' +
    'among between within without out up down off as than when while where whence whither till until shall will ' +
    'should would may might must can could do doth did does done be is am are was were been being have hath had has ' +
    'let o oh behold'
  ).split(' '),
);

export const isFunctionWord = (n: string) => FUNCTION_WORDS.has(n);

/**
 * A gap of exactly one KJV word and one ASV word between two matched ranges is a one-for-one swap
 * ("wells"/"springs", "unto"/"upon"), unless one is a function word and the other is not: the ASV
 * then reworded the phrase ("taketh hold of" / "holdeth fast", Isa 56:6), and the number belongs elsewhere.
 */
function fillGap(kjv: VerseWord[], asv: VerseWord[], out: (WordMatch | null)[], before: number[], after: number[]) {
  const [k, a] = [before[1], before[3]];
  if (after[0] - k !== 1 || after[2] - a !== 1) return;
  if (isFunctionWord(kjv[k].n) !== isFunctionWord(asv[a].n)) return;
  out[a] = { k, rule: 'position' };
}

export interface TransferStats {
  words: number;
  tagged: number;
  /** Tagged words by how they were matched. */
  rules: Record<Rule, number>;
  /** ASV words matched to an untagged KJV word (the KJV's italics or untagged text). */
  kjvUntagged: number;
  /** Matched ASV words left untagged because the ASV prints them in italics. */
  italic: number;
}

/**
 * The ASV verse with Strong's numbers and morphology from the KJV verse. The text and italics are
 * unchanged: only tagged words (and the spaces inside a tagged phrase) become separate segments.
 */
export function transferStrongs(kjvSegs: Seg[], asvSegs: Seg[]): { segs: Seg[]; stats: TransferStats } {
  const kjv = verseWords(kjvSegs);
  const asv = verseWords(asvSegs);
  const stats: TransferStats = { words: asv.words.length, tagged: 0, rules: { same: 0, similar: 0, position: 0 }, kjvUntagged: 0, italic: 0 };
  const unitOfWord = alignWords(kjv.words, asv.words).map((match, j) => {
    if (!match) return -1;
    if (asv.words[j].a) {
      stats.italic++;
      return -1;
    }
    const u = kjv.words[match.k].unit;
    if (u < 0) {
      stats.kjvUntagged++;
      return -1;
    }
    stats.tagged++;
    stats.rules[match.rule]++;
    return u;
  });

  // Element per character: each word's, and what is between two words of the same element (spaces
  // or punctuation, as in the KJV's "them, and God"), unless it is in italics.
  const unitAt = new Int32Array(asv.text.length).fill(-1);
  const italicAt: boolean[] = [];
  for (const s of asvSegs) for (let i = 0; i < (typeof s === 'string' ? s : s.t).length; i++) italicAt.push(typeof s !== 'string' && !!s.a);
  asv.words.forEach((w, j) => {
    const u = unitOfWord[j];
    if (u < 0) return;
    unitAt.fill(u, w.start, w.end);
    const next = asv.words[j + 1];
    if (next && unitOfWord[j + 1] === u && !italicAt.slice(w.end, next.start).some(Boolean)) unitAt.fill(u, w.end, next.start);
  });

  const segs: Seg[] = [];
  for (let i = 0; i < asv.text.length; ) {
    let j = i + 1;
    while (j < asv.text.length && unitAt[j] === unitAt[i] && italicAt[j] === italicAt[i]) j++;
    const t = asv.text.slice(i, j);
    const u = unitAt[i];
    if (u >= 0) segs.push({ t, ...kjv.units[u] });
    else if (italicAt[i]) segs.push({ t, a: 1 });
    else segs.push(t);
    i = j;
  }
  return { segs, stats };
}

/** The segments without Strong's numbers or morphology, merged as the untagged conversion has them. */
export function withoutStrongs(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const t = typeof s === 'string' ? s : s.t;
    const italic = typeof s !== 'string' && !!s.a;
    const prev = out[out.length - 1];
    if (prev !== undefined && (typeof prev === 'string') === !italic) {
      if (typeof prev === 'string') out[out.length - 1] = prev + t;
      else prev.t += t;
    } else out.push(italic ? { t, a: 1 } : t);
  }
  return out;
}
