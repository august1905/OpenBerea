import { describe, expect, it } from 'vitest';

import { fromCompact } from '@/lib/bible/refs';
import { verseCount } from '@/lib/bible/versification';
import type { ChapterText, Seg } from '@/lib/data/types';

import starters from '../../../content/memorize-starters.json';
import { practiceHref, toMode, toTranslation } from './modes';
import { buildPassage, chaptersOf, parseCompactRef, unitOf } from './passage';
import { type Attempt, percent, summarize, upsertAttempt } from './session';

const attempt = (over: Partial<Attempt>): Attempt => ({
  id: 1,
  ref: 'JHN.3.16',
  tr: 'kjv',
  mode: 'first-letter',
  answered: 0,
  correct: 0,
  missed: [],
  done: false,
  ...over,
});

describe('session score', () => {
  it('adds and updates attempts in memory', () => {
    let s = { attempts: [] as Attempt[] };
    s = upsertAttempt(s, attempt({ id: 1, answered: 3, correct: 2, missed: ['world'] }));
    s = upsertAttempt(s, attempt({ id: 1, answered: 25, correct: 24, missed: ['world'], done: true }));
    s = upsertAttempt(s, attempt({ id: 2, ref: 'PSA.23.1', answered: 9, correct: 8, missed: ['World'] }));
    expect(s.attempts).toHaveLength(2);
    const sum = summarize(s);
    expect(sum.answered).toBe(34);
    expect(sum.correct).toBe(32);
    expect(sum.accuracy).toBeCloseTo(32 / 34);
    expect(sum.passages).toBe(2);
    expect(sum.missed).toEqual([{ word: 'world', count: 2 }]);
  });

  it('leaves out attempts with nothing answered and reports no accuracy when empty', () => {
    const s = upsertAttempt({ attempts: [] }, attempt({ id: 9 }));
    expect(s.attempts).toEqual([]);
    expect(summarize(s).accuracy).toBeNull();
    expect(percent(0.926)).toBe(93);
  });
});

describe('practice URL', () => {
  it('builds and reads the practice link', () => {
    expect(practiceHref({ ref: 'ROM.8.28-30', tr: 'kjv', mode: 'first-letter' })).toBe('/memorize/practice?ref=ROM.8.28-30&tr=kjv&mode=first-letter');
    expect(practiceHref({ ref: 'PSA.23', tr: 'asv', mode: 'scramble', part: 'chain-2' })).toBe('/memorize/practice?ref=PSA.23&tr=asv&mode=scramble&part=chain-2');
    expect(toMode('scramble')).toBe('scramble');
    expect(toMode('bogus')).toBe('first-letter');
    expect(toTranslation('asv')).toBe('asv');
    expect(toTranslation('niv')).toBe('kjv');
  });

  it('validates compact refs against the versification', () => {
    expect(parseCompactRef('ROM.8.28-30', verseCount)).toEqual({ book: 'ROM', chapter: 8, verse: 28, endVerse: 30 });
    expect(parseCompactRef('psa.23', verseCount)).toEqual({ book: 'PSA', chapter: 23 });
    expect(parseCompactRef('PSA.23.7', verseCount)).toBeNull();
    expect(parseCompactRef('PSA.151', verseCount)).toBeNull();
    expect(parseCompactRef('JHN.3.18-16', verseCount)).toBeNull();
    expect(parseCompactRef('', verseCount)).toBeNull();
    expect(chaptersOf(fromCompact('GEN.1.31-2.3')!)).toEqual([1, 2]);
  });
});

describe('passage', () => {
  const text = (segs: Seg[]) => segs.map((s) => (typeof s === 'string' ? s : s.t)).join('');
  const psalm: ChapterText = {
    b: 'PSA',
    c: 23,
    tr: 'kjv',
    v: [
      { n: 1, s: [{ t: 'The ' }, { t: 'Lord', dn: 1 }, ' is my shepherd; I shall not want.'] },
      { n: 2, s: ['He maketh me to lie down in green pastures.'] },
      { n: 3, s: ['He restoreth my soul.'] },
    ],
  };

  it('keeps the verses the ref covers and marks small capitals', () => {
    const p = buildPassage([psalm], fromCompact('PSA.23.1-2')!, 'kjv', text);
    expect(p.verses.map((v) => v.n)).toEqual([1, 2]);
    expect(p.verses[0].words[1]).toMatchObject({ text: 'Lord', sc: true });
    expect(p.verses[0].words[0].sc).toBeUndefined();
  });

  it('cuts units with words numbered from zero', () => {
    const p = buildPassage([psalm], fromCompact('PSA.23')!, 'kjv', text);
    const unit = unitOf('PSA', p.verses, { start: 1, end: 2 });
    expect(unit.ref).toEqual({ book: 'PSA', chapter: 23, verse: 2, endVerse: 3 });
    expect(unit.words[0]).toMatchObject({ i: 0, text: 'He', vi: 0, verseStart: true });
    expect(unit.words[9]).toMatchObject({ text: 'He', vi: 1, verseStart: true });
    expect(unitOf('PSA', p.verses, { start: 0, end: 0 }).ref).toEqual({ book: 'PSA', chapter: 23, verse: 1 });
  });
});

describe('starter sets', () => {
  it('has unique ids and refs that are valid in the KJV versification', () => {
    expect(starters.sets.length).toBeGreaterThanOrEqual(20);
    expect(new Set(starters.sets.map((s) => s.id)).size).toBe(starters.sets.length);
    for (const set of starters.sets) {
      expect(set.title.trim(), set.id).not.toBe('');
      const ref = fromCompact(set.ref);
      expect(ref, set.ref).not.toBeNull();
      expect(verseCount(ref!.book, ref!.chapter), set.ref).toBeGreaterThan(0);
      if (ref!.verse !== undefined) expect(ref!.verse <= verseCount(ref!.book, ref!.chapter), set.ref).toBe(true);
      if (ref!.endVerse !== undefined) {
        expect(ref!.endVerse <= verseCount(ref!.book, ref!.endChapter ?? ref!.chapter), set.ref).toBe(true);
        expect(ref!.endVerse > ref!.verse!, set.ref).toBe(true);
      }
      expect(parseCompactRef(set.ref, verseCount), set.ref).not.toBeNull();
    }
  });

  it('includes Psalm 23 and Romans 8', () => {
    const refs = starters.sets.map((s) => s.ref);
    expect(refs).toContain('PSA.23');
    expect(refs).toContain('ROM.8');
  });
});
