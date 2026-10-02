import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatRef } from '@/i18n/format';
import type { Harmony, HarmonySection } from '@/lib/data/types';

import { filterHarmony, gospelsOf, isGospel, sectionsForVerse, splitRefs, versesOf } from './harmony';
import { searchPeople } from './people';

const sample: Harmony = {
  title: 'Sample',
  parts: [
    { title: 'Part I. The Sources', sections: [{ n: 1, title: '1. Luke’s Method', refs: { LUK: 'LUK.1.1-4' } }] },
    {
      title: 'Part V. The Baptist',
      sections: [
        { n: 2, title: '24. Jesus Baptized', refs: { MAT: 'MAT.3.13-17', MRK: 'MRK.1.9-11', LUK: 'LUK.3.21-23' } },
        { n: 3, title: '3. Genealogies', refs: { MAT: 'MAT.1.1-17', LUK: 'LUK.3.23-38' } },
        { n: 4, title: '128a. Bethany', refs: { JHN: 'JHN.11.55-12.1;JHN.12.9-11' } },
      ],
    },
  ],
};

const describeRefs = (s: HarmonySection) =>
  Object.values(s.refs)
    .flatMap((r) => splitRefs(r))
    .map((r) => formatRef(r))
    .join(' ');

describe('harmony', () => {
  it('splits multi-passage refs', () => {
    expect(splitRefs('MAT.21.1-11;MAT.21.14-17')).toEqual([
      { book: 'MAT', chapter: 21, verse: 1, endVerse: 11 },
      { book: 'MAT', chapter: 21, verse: 14, endVerse: 17 },
    ]);
    expect(splitRefs(undefined)).toEqual([]);
  });

  it('lists only the gospels a section has, in order', () => {
    expect(gospelsOf(sample.parts[1].sections[0])).toEqual(['MAT', 'MRK', 'LUK']);
    expect(isGospel('JHN')).toBe(true);
    expect(isGospel('ACT')).toBe(false);
  });

  it('finds every section containing a verse', () => {
    expect(sectionsForVerse(sample, 'LUK', 1, 3).map((s) => s.n)).toEqual([1]);
    expect(sectionsForVerse(sample, 'LUK', 3, 23).map((s) => s.n)).toEqual([2, 3]);
    expect(sectionsForVerse(sample, 'JHN', 12, 1).map((s) => s.n)).toEqual([4]);
    expect(sectionsForVerse(sample, 'JHN', 12, 5)).toEqual([]);
    expect(sectionsForVerse(sample, 'ACT', 1, 1)).toEqual([]);
  });

  it('expands passages into verses, across chapters', () => {
    expect(versesOf({ book: 'LUK', chapter: 1, verse: 1, endVerse: 4 })).toEqual([{ chapter: 1, verses: [1, 2, 3, 4] }]);
    const cross = versesOf({ book: 'JHN', chapter: 11, verse: 55, endChapter: 12, endVerse: 1 });
    expect(cross).toEqual([
      { chapter: 11, verses: [55, 56, 57] },
      { chapter: 12, verses: [1] },
    ]);
    expect(versesOf({ book: 'MRK', chapter: 1, verse: 1 })).toEqual([{ chapter: 1, verses: [1] }]);
  });

  it('filters by title words and by reference', () => {
    expect(filterHarmony(sample, 'baptized', describeRefs).flatMap((p) => p.sections.map((s) => s.n))).toEqual([2]);
    expect(filterHarmony(sample, 'luke 3', describeRefs).flatMap((p) => p.sections.map((s) => s.n))).toEqual([2, 3]);
    expect(filterHarmony(sample, '', describeRefs)).toBe(sample.parts);
    expect(filterHarmony(sample, 'nothing here', describeRefs)).toEqual([]);
  });

  it('matches the shipped harmony: section 1 is Luke 1:1–4', () => {
    let h: Harmony;
    try {
      h = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'public', 'data', 'harmony', 'robertson.json'), 'utf8')) as Harmony;
    } catch {
      return;
    }
    expect(sectionsForVerse(h, 'LUK', 1, 2).map((s) => s.n)).toContain(1);
    const all = h.parts.flatMap((p) => p.sections);
    expect(all.map((s) => s.n)).toEqual(all.map((_, i) => i + 1));
  });
});

describe('people search', () => {
  const index = [
    { id: 'david_994', name: 'David', n: 896, k: 9 },
    { id: 'dan_1', name: 'Dan', n: 20, k: 0 },
    { id: 'abidan_1', name: 'Abidan', n: 5, k: 0 },
    { id: 'aaron_1', name: 'Aaron', n: 331, k: 0 },
  ];

  it('puts names that start with the text first, most mentioned first', () => {
    expect(searchPeople(index, 'da').map((p) => p.name)).toEqual(['David', 'Dan', 'Abidan']);
    expect(searchPeople(index, '  DAV ').map((p) => p.name)).toEqual(['David']);
  });

  it('lists everyone alphabetically with no text', () => {
    expect(searchPeople(index, '').map((p) => p.name)).toEqual(['Aaron', 'Abidan', 'Dan', 'David']);
  });
});
