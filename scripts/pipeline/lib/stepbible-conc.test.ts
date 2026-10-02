import { describe, expect, it } from 'vitest';

import type { ChapterText, OrigChapter } from '../../../src/lib/data/types';
import { concEntry, countOccurrences, countRenderings, normalizeRendering, type Occurrences, sortRenderings } from './stepbible-conc';

// Synthetic KJV chapters in the ChapterText shape (segments with Strong's arrays).
const kjv: ChapterText[] = [
  {
    b: 'JHN',
    c: 3,
    tr: 'kjv',
    v: [
      {
        n: 16,
        s: [
          { t: 'For', s: ['G1063'] },
          ' ',
          { t: 'God', s: ['G3588', 'G2316'] },
          ' ',
          { t: 'so', s: ['G3779'] },
          ' ',
          { t: 'loved', s: ['G25'] },
          ' the world, ',
          { t: 'his', a: 1 },
        ],
      },
      { n: 35, s: [{ t: 'The Father', s: ['G3962'] }, ' ', { t: 'loveth', s: ['G25'] }, '.'] },
    ],
  },
  {
    b: 'PSA',
    c: 51,
    tr: 'kjv',
    title: [{ t: 'of David,', s: ['H1732'] }],
    v: [{ n: 1, s: [{ t: 'Have mercy', s: ['H2603'] }, ' upon me, O ', { t: 'God,', s: ['H430'] }] }],
  },
  {
    b: 'GEN',
    c: 1,
    tr: 'kjv',
    v: [{ n: 1, s: [{ t: 'In the beginning', s: ['H7225'] }, ' ', { t: 'God', s: ['H430'] }, ' ', { t: '“Loved”', s: ['G25'] }] }],
  },
];

describe('countRenderings', () => {
  it('normalizes renderings', () => {
    expect(normalizeRendering('God,')).toBe('god');
    expect(normalizeRendering(' “Loved” ')).toBe('loved');
    expect(normalizeRendering('the  LORD’s')).toBe('the lord’s');
    expect(normalizeRendering('—')).toBe('');
  });

  it('counts each Strong number of a segment and merges duplicates', () => {
    const counts = countRenderings(kjv);
    expect(sortRenderings(counts.get('G25'))).toEqual([
      ['loved', 2],
      ['loveth', 1],
    ]);
    expect(sortRenderings(counts.get('H430'))).toEqual([['god', 2]]);
    expect(sortRenderings(counts.get('G3588'))).toEqual([['god', 1]]);
    expect(sortRenderings(counts.get('H1732'))).toEqual([['of david', 1]]); // Psalm title
    expect(counts.has('his')).toBe(false);
    expect(sortRenderings(undefined)).toEqual([]);
  });

  it('accumulates across calls', () => {
    const into = countRenderings([kjv[0]]);
    countRenderings([kjv[2]], into);
    expect(into.get('G25')?.get('loved')).toBe(2);
  });
});

describe('countOccurrences', () => {
  const ot: OrigChapter = {
    b: 'PSA',
    c: 51,
    lang: 'hbo',
    v: [
      { n: 0, w: [{ t: 'לְדָוִֽד׃', x: '', g: 'of David', s: 'H1732', m: 'HR/Npm', p: [{ t: 'לְ', s: 'H9005' }, { t: 'דָוִֽד', s: 'H1732' }] }] },
      {
        n: 1,
        w: [
          { t: 'אֱלֹהִים', x: '', g: 'God', s: 'H430', m: 'HNcmpa' },
          { t: 'בּוֹ', x: '', g: 'in it', s: 'H9033', m: 'HR/Sp3ms', p: [{ t: 'בּ', s: 'H9003' }, { t: 'וֹ', s: 'H9033' }] },
          { t: 'אֱלֹהִים', x: '', g: 'God', s: 'H430', m: 'HNcmpa' },
        ],
      },
    ],
  };
  const nt: OrigChapter = { b: 'JHN', c: 3, lang: 'grc', v: [{ n: 16, w: [{ t: 'ἠγάπησεν', x: '', g: 'loved', s: 'G25', m: 'V-AAI-3S' }] }] };

  it('counts roots, skips affix tags, and keeps verse ids unique and sorted', () => {
    const occ = new Map<string, Occurrences>();
    expect(countOccurrences(ot, occ)).toBe(1); // בּוֹ is only affixes
    countOccurrences(nt, occ);
    expect([...occ.keys()].sort()).toEqual(['G25', 'H1732', 'H430']);
    expect(concEntry(occ.get('H430')!, new Map([['god', 3]]))).toEqual({ n: 2, v: [19051001], kjv: [['god', 3]] });
    expect(concEntry(occ.get('H1732')!, undefined)).toEqual({ n: 1, v: [19051000], kjv: [] });
    expect(concEntry(occ.get('G25')!, undefined).v).toEqual([43003016]);
  });
});
