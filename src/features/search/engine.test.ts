import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { verseAtOrdinal, verseOrdinal } from '@/lib/bible/versification';
import type { LexIndex } from '@/lib/data/types';

import { compileQuery, detectMode, foldOriginal, highlightRuns, normalizeStrongsQuery, searchCorpus, searchLexicon } from './engine';

const corpus = [
  'For God so loved the world, that he gave his only begotten Son',
  'Beloved, let us love one another: for love is of God',
  'He that loveth not knoweth not God; for God is love.',
  'And the LORD God formed man of the dust of the ground',
  "The LORD's portion is his people",
];

describe('detectMode', () => {
  it('recognizes Strong’s numbers, original script, phrases, and words', () => {
    expect(detectMode('G25')).toBe('strongs');
    expect(detectMode('h430')).toBe('strongs');
    expect(detectMode('ἀγάπη')).toBe('original');
    expect(detectMode('אהב')).toBe('original');
    expect(detectMode('"only begotten"')).toBe('phrase');
    expect(detectMode('love God')).toBe('words');
  });
});

describe('searchCorpus', () => {
  it('requires every word, as whole words, ignoring case', () => {
    expect(searchCorpus(corpus, compileQuery('love God', 'words')!)).toEqual([1, 2]);
    expect(searchCorpus(corpus, compileQuery('LOVE', 'words')!)).toEqual([1, 2]);
  });

  it('supports * for word beginnings', () => {
    expect(searchCorpus(corpus, compileQuery('lov*', 'words')!)).toEqual([0, 1, 2]);
  });

  it('matches exact phrases across punctuation', () => {
    expect(searchCorpus(corpus, compileQuery('"only begotten son"', 'phrase')!)).toEqual([0]);
    expect(searchCorpus(corpus, compileQuery('the world that', 'phrase')!)).toEqual([0]);
    expect(searchCorpus(corpus, compileQuery('"begotten world"', 'phrase')!)).toEqual([]);
  });

  it('handles apostrophes', () => {
    expect(searchCorpus(corpus, compileQuery("LORD's", 'words')!)).toEqual([4]);
  });

  it('highlights matched terms', () => {
    const q = compileQuery('love God', 'words')!;
    const runs = highlightRuns(corpus[2], q.highlight);
    expect(runs.filter((r) => r.hit).map((r) => r.t)).toEqual(['God', 'God', 'love']);
    expect(runs.map((r) => r.t).join('')).toBe(corpus[2]);
  });
});

describe('original-language search', () => {
  const index: LexIndex = [
    ['G25', 'ἀγαπάω', 'agapaō', 'to love'],
    ['G26', 'ἀγάπη', 'agapē', 'love'],
    ['G27', 'ἀγαπητός', 'agapētos', 'beloved'],
    ['H157', 'אָהַב', 'ʼâhab', 'to love'],
  ];
  it('ignores accents and points', () => {
    expect(foldOriginal('ἀγάπη')).toBe(foldOriginal('αγαπη'));
    expect(searchLexicon(index, 'αγαπη')[0][0]).toBe('G26');
    expect(searchLexicon(index, 'אהב')[0][0]).toBe('H157');
  });
  it('matches transliterations, exact first', () => {
    expect(searchLexicon(index, 'agape').map((r) => r[0])).toEqual(['G26', 'G27']);
    expect(searchLexicon(index, 'agap').map((r) => r[0])).toEqual(['G25', 'G26', 'G27']);
  });
  it('normalizes Strong’s queries', () => {
    expect(normalizeStrongsQuery('g0025')).toBe('G25');
  });
});

const KJV = join(__dirname, '..', '..', '..', 'public', 'data', 'search', 'kjv.json');
const hasCorpus = (() => {
  try {
    readFileSync(KJV);
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasCorpus)('KJV corpus', () => {
  const kjv = JSON.parse(readFileSync(KJV, 'utf8')) as string[];
  it('has one entry per KJV verse, in canonical order', () => {
    expect(kjv).toHaveLength(31102);
    expect(kjv[verseOrdinal('JHN', 3, 16)]).toMatch(/^For God so loved the world/);
    expect(kjv[verseOrdinal('GEN', 1, 1)]).toBe('In the beginning God created the heaven and the earth.');
  });
  it('finds a known phrase quickly', () => {
    const t0 = performance.now();
    const hits = searchCorpus(kjv, compileQuery('"only begotten Son"', 'phrase')!);
    const ms = performance.now() - t0;
    const refs = hits.map(verseAtOrdinal).map((v) => `${v.bookIndex}.${v.chapter}.${v.verse}`);
    expect(refs).toContain('43.3.16');
    expect(ms).toBeLessThan(200);
  });
});
