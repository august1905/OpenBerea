import type { OrigWord, Seg } from '@/lib/data/types';

// Strong's gives some inflected or suppletive forms their own numbers (μου G3450, εἶπον G2036), and
// STEPBible adds a few of its own (οἶδα G6063). The KJV module tags these by lemma (G1473, G3004, …),
// so for alignment each number is compared through its form family.
const FAMILIES: string[][] = [
  ['G1473', 'G1691', 'G1698', 'G1700', 'G3165', 'G3427', 'G3450', 'G2248', 'G2249', 'G2254', 'G2257', 'G1683', 'G2504', 'G1699', 'G2251'],
  ['G4771', 'G4571', 'G4671', 'G4675', 'G5209', 'G5210', 'G5213', 'G5216', 'G4572', 'G4674', 'G5212'],
  ['G3004', 'G2036', 'G2046', 'G4483', 'G5346'],
  ['G3708', 'G1492', 'G3700', 'G6063'],
  ['G2532', 'G2579', 'G2504'],
  ['G846', 'G848'],
  ['G1510', 'G2258', 'G1511', 'G2071', 'G5600', 'G5607'],
  ['G2064', 'G2240'],
  ['G4314', 'G4012'],
  ['H1980', 'H3212'],
  ['H2895', 'H2896', 'H2898'],
];
const FAMILY = new Map<string, number>();
FAMILIES.forEach((members, i) => members.forEach((m) => FAMILY.set(m, FAMILY.get(m) ?? i)));
// Words in two families (e.g. κἀγώ, οἶδα/εἶδον) link both.
const EXTRA: Record<string, number[]> = { G2504: [0, 4], G1492: [3], G6063: [3] };

function sameLexeme(a: string, b: string): boolean {
  if (a === b) return true;
  const fa = EXTRA[a] ?? (FAMILY.has(a) ? [FAMILY.get(a)!] : []);
  const fb = EXTRA[b] ?? (FAMILY.has(b) ? [FAMILY.get(b)!] : []);
  return fa.some((x) => fb.includes(x));
}

/**
 * Pairs each Strong's-tagged KJV segment with the original-language words it translates, by matching
 * Strong's numbers within the verse. Matching walks forward from the last match so repeated words
 * (e.g. two "אֵת") pair in order. Returns, for each segment index, the indices of its original words.
 */
export function alignVerse(segs: Seg[], words: OrigWord[]): { bySeg: Map<number, number[]>; unmatched: number[] } {
  const used = new Set<number>();
  const bySeg = new Map<number, number[]>();
  let cursor = 0;

  const exact = (w: OrigWord, s: string) => w.s === s || !!w.p?.some((m) => m.s === s);
  const family = (w: OrigWord, s: string) => sameLexeme(w.s, s);
  const find = (s: string): number => {
    // Exact numbers first, then form families; each scan starts after the last match.
    for (const test of [exact, family]) {
      for (let i = cursor; i < words.length; i++) if (!used.has(i) && test(words[i], s)) return i;
      for (let i = 0; i < cursor; i++) if (!used.has(i) && test(words[i], s)) return i;
    }
    return -1;
  };

  // The KJV module splits "The LORD" into two tagged runs ("The " + small-caps "LORD", both H3068).
  // A divine-name run that repeats the previous run's number shares that run's word. (Other repeats,
  // like "Holy, holy, holy", are separate words.)
  let previous = new Map<string, number>();
  segs.forEach((seg, si) => {
    if (typeof seg === 'string' || !seg.s?.length) return;
    const found: number[] = [];
    const current = new Map<string, number>();
    for (const s of seg.s) {
      let i = seg.dn && previous.has(s) ? previous.get(s)! : find(s);
      if (i >= 0 && !used.has(i)) {
        used.add(i);
        cursor = i + 1;
      }
      if (i < 0) continue;
      found.push(i);
      current.set(s, i);
    }
    previous = current;
    if (found.length) bySeg.set(si, [...new Set(found)].sort((a, b) => a - b));
  });

  const unmatched = words.map((_, i) => i).filter((i) => !used.has(i));
  return { bySeg, unmatched };
}

/** The original words for one tapped KJV segment, or [] when none match. */
export function wordsForSegment(segs: Seg[], segIndex: number, words: OrigWord[]): OrigWord[] {
  return (alignVerse(segs, words).bySeg.get(segIndex) ?? []).map((i) => words[i]);
}
