import { describe, expect, it } from 'vitest';

import type { ChapterText, DictIndex, OrigVerse, VariantChapter } from '@/lib/data/types';

import { covers, entryForVerse, entryLabel, toCommentaryId } from './commentary';
import { batches, chapterKey, previewChapters, previewText, truncate, verseXrefs, versesWithXrefs } from './crossrefs';
import { entriesForLetter, findEntry, fold, letterOf, lettersWithEntries, neighbors, searchAll, searchIndex } from './dictionary';
import { commentaryHref, crossrefsHref, dictEntryHref, inductiveHref, topicHref } from './hrefs';
import { bareWord, editionLegend, formatEditions, groupUnits, parseEditions, variantVerses } from './variants';

describe('cross-references', () => {
  const tsk = { '16': ['LUK.2.14', 'ROM.5.8', '2CO.5.19-21'], '2': ['JHN.1.1'] };
  const ob = { '16': [['ROM.5.8', 984], ['1JN.4.9-10', 698]] as [string, number][], '40': [['GEN.1.1', 3]] as [string, number][] };

  it('reads one verse from both sources', () => {
    expect(verseXrefs(tsk, ob, 16)).toEqual({ tsk: tsk['16'], openbible: ob['16'] });
    expect(verseXrefs(tsk, undefined, 3)).toEqual({ tsk: [], openbible: [] });
  });

  it('lists verses with refs from either source, ascending', () => {
    expect(versesWithXrefs(tsk, ob)).toEqual([2, 16, 40]);
  });

  it('groups refs into the chapters needed for previews, in first-use order', () => {
    expect(chapterKey('2CO.5.19-21')).toBe('2CO.5');
    expect(chapterKey('nonsense')).toBeNull();
    expect(previewChapters(['ROM.5.8', 'LUK.2.14', 'ROM.5.10', 'ROM.8.32', 'JHN.3.15-4.2'])).toEqual(['ROM.5', 'LUK.2', 'ROM.8', 'JHN.3']);
  });

  it('splits work into batches', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([], 3)).toEqual([]);
  });

  it('truncates at a word boundary', () => {
    expect(truncate('short text')).toBe('short text');
    expect(truncate('one two three four five six', 14)).toBe('one two three…');
  });

  it('previews a verse or a range from KJV text', () => {
    const ch: ChapterText = {
      b: 'ROM',
      c: 5,
      tr: 'kjv',
      v: [
        { n: 7, s: ['For scarcely for a righteous man will one die.'] },
        { n: 8, s: ['But God commendeth ', { t: 'his', s: ['G1438'] }, ' love toward us.'] },
        { n: 9, s: ['Much more then.'] },
      ],
    };
    expect(previewText('ROM.5.8', ch)).toBe('But God commendeth his love toward us.');
    expect(previewText('ROM.5.8-9', ch)).toBe('But God commendeth his love toward us. Much more then.');
    expect(previewText('ROM.5', ch)).toBeNull(); // chapter refs preview verse 1, which this sample lacks
    expect(previewText('ROM.5.8', undefined)).toBeNull();
  });
});

describe('commentaries', () => {
  const entries = [{ blocks: [] }, { v: [14, 16] as [number, number], blocks: [] }, { v: [16, 16] as [number, number], blocks: [] }, { v: [17, 21] as [number, number], blocks: [] }];

  it('labels entries by verse range', () => {
    expect(entryLabel()).toEqual({ kind: 'intro' });
    expect(entryLabel([16, 16])).toEqual({ kind: 'verse', n: 16 });
    expect(entryLabel([14, 16])).toEqual({ kind: 'verses', from: 14, to: 16 });
  });

  it('finds the entry for a verse: starting there first, then the narrowest covering it', () => {
    expect(entryForVerse(entries, 16)).toBe(2);
    expect(entryForVerse(entries, 15)).toBe(1);
    expect(entryForVerse(entries, 19)).toBe(3);
    expect(entryForVerse(entries, 30)).toBe(-1);
    expect(entryForVerse([{ v: [1, 21], blocks: [] }, { v: [22, 36], blocks: [] }], 16)).toBe(0);
  });

  it('knows Barnes covers only the New Testament', () => {
    expect(covers('barnes', 'OT')).toBe(false);
    expect(covers('barnes', 'NT')).toBe(true);
    expect(covers('mhc', 'OT')).toBe(true);
    expect(toCommentaryId('jfb')).toBe('jfb');
    expect(toCommentaryId('gill')).toBe('mhc');
    expect(toCommentaryId(undefined)).toBe('mhc');
  });
});

describe('dictionaries', () => {
  const index: DictIndex = [
    ['aaron', 'Aaron', 0],
    ['aarons-rod', 'Aaron’s Rod', 0],
    ['abel', 'Abel', 0],
    ['esau', 'Ésaü', 3],
    ['faith', 'Faith', 4],
    ['love', 'Love', 9],
    ['brotherly-love', 'Brotherly Love', 1],
    ['glove', 'Glove', 5],
    ['1-esdras', '1 Esdras', 0],
  ];

  it('folds case, accents, and curly quotes', () => {
    expect(fold('  ÉSAÜ’s   Birthright ')).toBe("esau's birthright");
    expect(fold('Aaron')).toBe(fold('AARON'));
  });

  it('files entries under A–Z', () => {
    expect(letterOf('Ésaü')).toBe('E');
    expect(letterOf('“Abba”')).toBe('A');
    expect(letterOf('1 Esdras')).toBe('#');
    expect(entriesForLetter(index, 'A').map((e) => e[0])).toEqual(['aaron', 'aarons-rod', 'abel']);
    expect(lettersWithEntries(index).has('E')).toBe(true);
    expect(lettersWithEntries(index).has('Z')).toBe(false);
  });

  it('searches headwords case- and accent-insensitively, best matches first', () => {
    expect(searchIndex(index, 'esau').map((e) => e[0])).toEqual(['esau']);
    expect(searchIndex(index, 'AARON').map((e) => e[0])).toEqual(['aaron', 'aarons-rod']);
    expect(searchIndex(index, "aaron's").map((e) => e[0])).toEqual(['aarons-rod']);
    // exact, then word prefix, then contains
    expect(searchIndex(index, 'love').map((e) => e[0])).toEqual(['love', 'brotherly-love', 'glove']);
    expect(searchIndex(index, '   ')).toEqual([]);
  });

  it('groups results by dictionary in the given order and drops empty groups', () => {
    const other: DictIndex = [['love-feast', 'Love-feast', 2]];
    const groups = searchAll({ easton: index, smith: other, isbe: [] }, ['easton', 'smith', 'isbe'] as const, 'love');
    expect(groups.map((g) => [g.dict, g.entries.length])).toEqual([
      ['easton', 3],
      ['smith', 1],
    ]);
  });

  it('finds neighbors and entries by id', () => {
    expect(neighbors(index, 'aarons-rod')).toEqual({ prev: index[0], next: index[2] });
    expect(neighbors(index, 'aaron').prev).toBeUndefined();
    expect(neighbors(index, 'missing')).toEqual({});
    expect(findEntry(index, 'AARON')?.[0]).toBe('aaron');
  });
});

describe('textual variants', () => {
  it('parses edition lists, dropping word-order suffixes and duplicates', () => {
    expect(parseEditions('Treg+TR+Byz')).toEqual([
      { code: 'Treg', main: true },
      { code: 'TR', main: true },
      { code: 'Byz', main: true },
    ]);
    expect(parseEditions('TR»1+Byz«14.24+KJV+TR')).toEqual([
      { code: 'TR', main: true },
      { code: 'Byz', main: true },
      { code: 'KJV', main: false },
    ]);
    expect(formatEditions('NA28+NA27+P66*')).toBe('NA28, NA27, P66*');
  });

  it('builds the legend: the eight editions plus any other labels in the chapter', () => {
    const ch: VariantChapter = {
      b: 'JHN',
      c: 3,
      v: {
        '16': [{ w: 10, t: 'αὐτοῦ', g: 'of him', ed: 'Treg+TR+Byz', k: 'presence' }],
        '25': [{ w: 2, t: 'Ἰουδαίων', g: 'Jews', ed: 'TR+Byz+01+Latin', k: 'alt' }],
      },
    };
    const legend = editionLegend(ch);
    expect(legend.main).toEqual(['NA28', 'NA27', 'Tyn', 'SBL', 'WH', 'Treg', 'TR', 'Byz']);
    expect(legend.other).toEqual(['01', 'Latin']);
    expect(variantVerses(ch)).toEqual([16, 25]);
  });

  it('groups units by word with the printed word', () => {
    const verse: OrigVerse = {
      n: 2,
      w: [
        { t: 'οὗτος', x: 'houtos', g: 'He', s: 'G3778', m: 'D' },
        { t: 'ἦλθεν', x: 'ēlthen', g: 'came', s: 'G2064', m: 'V' },
        { t: 'πρὸς', x: 'pros', g: 'to', s: 'G4314', m: 'P' },
        { t: 'τὸν', x: 'ton', g: '<the>', s: 'G3588', m: 'T' },
        { t: 'αὐτὸν', x: 'auton', g: 'Him', s: 'G846', m: 'P' },
      ],
    };
    const groups = groupUnits(
      [
        { w: 4, t: 'αὐτὸν', g: 'Him', ed: 'NA28+Byz', k: 'presence' },
        { w: 3, t: 'τὸν', g: '<the>', ed: 'TR', k: 'presence' },
        { w: 4, t: 'Ἰησοῦν', g: 'Jesus', ed: 'TR', k: 'alt', s: 'G2424' },
      ],
      verse,
    );
    expect(groups.map((g) => [g.w, g.word, !!g.presence, g.alts.length])).toEqual([
      [3, 'τὸν', true, 0],
      [4, 'αὐτὸν', true, 1],
    ]);
  });

  it('strips trailing punctuation but keeps elision marks', () => {
    expect(bareWord('κόσμον,')).toBe('κόσμον');
    expect(bareWord('ἀλλ᾽')).toBe('ἀλλ᾽');
    expect(bareWord('αἰώνιον.')).toBe('αἰώνιον');
  });
});

describe('study links', () => {
  it('builds lower-case routes with optional query', () => {
    expect(crossrefsHref('JHN', 3, 16)).toBe('/study/crossrefs/jhn/3?v=16');
    expect(commentaryHref('1CO', 13)).toBe('/study/commentary/1co/13');
    expect(commentaryHref('JHN', 3, { c: 'jfb', v: 16 })).toBe('/study/commentary/jhn/3?c=jfb&v=16');
    expect(inductiveHref('PSA', 23)).toBe('/study/inductive/psa/23');
    expect(inductiveHref('JHN', 3, 1, 21)).toBe('/study/inductive/jhn/3?from=1&to=21');
    expect(dictEntryHref('easton', 'aaron')).toBe('/study/dictionary/easton/aaron');
    expect(dictEntryHref('nave', 'love')).toBe('/study/topics/love');
    expect(topicHref('god, love of')).toBe('/study/topics/god%2C%20love%20of');
  });
});

describe('inductive study', () => {
  it('reads an optional verse range, clamped to the chapter', async () => {
    const { inductiveRange, PROMPTS } = await import('./inductive');
    expect(inductiveRange('PSA', 23)).toEqual({});
    expect(inductiveRange('PSA', 23, '1', '3')).toEqual({ from: 1, to: 3 });
    expect(inductiveRange('PSA', 23, '4')).toEqual({ from: 4, to: 6 });
    expect(inductiveRange('PSA', 23, '1', '6')).toEqual({});
    expect(inductiveRange('PSA', 23, '3', '99')).toEqual({ from: 3, to: 6 });
    expect(inductiveRange('PSA', 23, '5', '2')).toEqual({ from: 5, to: 5 });
    expect(inductiveRange('PSA', 23, 'x')).toEqual({});
    expect(inductiveRange('PSA', 23, '40')).toEqual({});
    expect(Object.keys(PROMPTS)).toEqual(['observe', 'interpret', 'apply']);
  });
});
