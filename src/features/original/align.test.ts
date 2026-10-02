import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ChapterText, OrigChapter } from '@/lib/data/types';

import { alignVerse } from './align';
import { baseStrongs } from './data';

const DATA = join(__dirname, '..', '..', '..', 'public', 'data');
const has = (() => {
  try {
    readFileSync(join(DATA, 'kjv', 'GEN', '1.json'));
    readFileSync(join(DATA, 'stepbible', 'orig', 'GEN', '1.json'));
    return true;
  } catch {
    return false;
  }
})();
const load = <T,>(rel: string) => JSON.parse(readFileSync(join(DATA, rel), 'utf8')) as T;

describe('baseStrongs', () => {
  it('normalizes ids', () => {
    expect(baseStrongs('G0025')).toBe('G25');
    expect(baseStrongs('H0430G')).toBe('H430');
    expect(baseStrongs('h7225')).toBe('H7225');
    expect(baseStrongs('G25')).toBe('G25');
    expect(baseStrongs('love')).toBeNull();
  });
});

describe.skipIf(!has)('alignment with real data', () => {
  it('pairs Genesis 1:1 English words with the Hebrew', () => {
    const kjv = load<ChapterText>('kjv/GEN/1.json').v[0];
    const heb = load<OrigChapter>('stepbible/orig/GEN/1.json').v.find((v) => v.n === 1)!;
    const { bySeg } = alignVerse(kjv.s, heb.w);
    const pairs = [...bySeg.entries()].map(([si, wi]) => {
      const seg = kjv.s[si];
      return [typeof seg === 'string' ? seg : seg.t, wi.map((i) => heb.w[i].s).join('+')];
    });
    expect(pairs).toContainEqual(['God', 'H430']);
    // The KJV tags "created" with both בָּרָא and the object marker אֵת.
    expect(pairs.find((p) => p[0] === 'created')?.[1]).toContain('H1254');
    expect(pairs.find((p) => p[0].includes('beginning'))?.[1]).toBe('H7225');
    expect(pairs.find((p) => p[0].includes('earth'))?.[1]).toBe('H776');
  });

  it('pairs John 3:16 English words with the Greek', () => {
    const kjv = load<ChapterText>('kjv/JHN/3.json').v[15];
    const grk = load<OrigChapter>('stepbible/orig/JHN/3.json').v.find((v) => v.n === 16)!;
    const { bySeg } = alignVerse(kjv.s, grk.w);
    const loved = kjv.s.findIndex((s) => typeof s !== 'string' && s.t === 'loved');
    expect(bySeg.get(loved)!.map((i) => grk.w[i].s)).toEqual(['G25']);
    const god = kjv.s.findIndex((s) => typeof s !== 'string' && s.t === 'God');
    expect(bySeg.get(god)!.map((i) => grk.w[i].s)).toEqual(['G3588', 'G2316']);
  });

  it('keeps repeated words separate (Isaiah 6:3) and joins "The LORD" (Psalm 23:1)', () => {
    const isa = load<ChapterText>('kjv/ISA/6.json').v[2];
    const heb = load<OrigChapter>('stepbible/orig/ISA/6.json').v.find((v) => v.n === 3)!;
    const { bySeg } = alignVerse(isa.s, heb.w);
    const holy = isa.s.map((s, i) => [s, i] as const).filter(([s]) => typeof s !== 'string' && s.s?.includes('H6918'));
    const words = holy.map(([, i]) => bySeg.get(i)?.[0]);
    expect(new Set(words).size).toBe(holy.length);
    const ps = load<ChapterText>('kjv/PSA/23.json').v[0];
    const psh = load<OrigChapter>('stepbible/orig/PSA/23.json').v.find((v) => v.n === 1)!;
    const al = alignVerse(ps.s, psh.w).bySeg;
    const lordRuns = ps.s.map((s, i) => [s, i] as const).filter(([s]) => typeof s !== 'string' && s.s?.includes('H3068'));
    expect(lordRuns.length).toBe(2);
    expect(al.get(lordRuns[0][1])).toEqual(al.get(lordRuns[1][1]));
  });

  it.each([
    ['JHN', 21],
    ['ROM', 16],
    ['GEN', 50],
    ['PSA', 150],
  ] as const)('aligns at least 95%% of tagged words in %s', (book, chapters) => {
    let tagged = 0;
    let aligned = 0;
    for (let c = 1; c <= chapters; c++) {
      const kjv = load<ChapterText>(`kjv/${book}/${c}.json`);
      const orig = load<OrigChapter>(`stepbible/orig/${book}/${c}.json`);
      for (const v of kjv.v) {
        const ov = orig.v.find((o) => o.n === v.n);
        if (!ov) continue;
        const { bySeg } = alignVerse(v.s, ov.w);
        tagged += v.s.filter((s) => typeof s !== 'string' && s.s?.length).length;
        aligned += bySeg.size;
      }
    }
    expect(aligned / tagged).toBeGreaterThan(0.95);
  });
});
