import { describe, expect, it } from 'vitest';

import { BOOKS, TOTAL_CHAPTERS, adjacentChapter, toBookCode } from './books';
import {
  fromCompact,
  fromVerseId,
  parseBookName,
  parseReference,
  refContainsVerse,
  toCompact,
  verseId,
} from './refs';

describe('books', () => {
  it('has 66 books and 1,189 chapters', () => {
    expect(BOOKS).toHaveLength(66);
    expect(TOTAL_CHAPTERS).toBe(1189);
    expect(BOOKS.filter((b) => b.testament === 'OT')).toHaveLength(39);
  });

  it('normalizes codes', () => {
    expect(toBookCode('jhn')).toBe('JHN');
    expect(toBookCode('1co')).toBe('1CO');
    expect(toBookCode('xyz')).toBeNull();
  });

  it('steps across book boundaries', () => {
    expect(adjacentChapter('GEN', 50, 1)).toEqual({ book: 'EXO', chapter: 1 });
    expect(adjacentChapter('EXO', 1, -1)).toEqual({ book: 'GEN', chapter: 50 });
    expect(adjacentChapter('REV', 22, 1)).toBeNull();
    expect(adjacentChapter('GEN', 1, -1)).toBeNull();
  });
});

describe('parseBookName', () => {
  it.each([
    ['Jn', 'JHN'],
    ['John', 'JHN'],
    ['Gen', 'GEN'],
    ['Gn', 'GEN'],
    ['Exod', 'EXO'],
    ['Deuter', 'DEU'],
    ['1 Cor', '1CO'],
    ['1Co', '1CO'],
    ['I Corinthians', '1CO'],
    ['First John', '1JN'],
    ['1st John', '1JN'],
    ['II Kings', '2KI'],
    ['2 Kgs', '2KI'],
    ['3 John', '3JN'],
    ['Ps', 'PSA'],
    ['Psalm', 'PSA'],
    ['Song of Solomon', 'SNG'],
    ['Song of Songs', 'SNG'],
    ['Phil', 'PHP'],
    ['Phlm', 'PHM'],
    ['Philem', 'PHM'],
    ['Jas', 'JAS'],
    ['Jude', 'JUD'],
    ['Jd', 'JUD'],
    ['Judg', 'JDG'],
    ['Jud', 'JDG'],
    ['Rev', 'REV'],
    ['Revelations', 'REV'],
    ['Mk', 'MRK'],
    ['Lk', 'LUK'],
    ['Mt', 'MAT'],
    ['Ezek', 'EZK'],
    ['Isa', 'ISA'],
    ['Is', 'ISA'],
    ['Eccl', 'ECC'],
    ['Zeph', 'ZEP'],
    ['Obad', 'OBA'],
    ['Heb.', 'HEB'],
  ])('%s → %s', (input, code) => {
    expect(parseBookName(input)).toBe(code);
  });

  it('rejects unknown or ambiguous names', () => {
    expect(parseBookName('Hezekiah')).toBeNull();
    expect(parseBookName('J')).toBeNull();
    expect(parseBookName('')).toBeNull();
  });
});

describe('parseReference', () => {
  it('parses verses, chapters, and ranges', () => {
    expect(parseReference('Jn 3:16')).toEqual({ book: 'JHN', chapter: 3, verse: 16 });
    expect(parseReference('john 3.16')).toEqual({ book: 'JHN', chapter: 3, verse: 16 });
    expect(parseReference('Jn3:16')).toEqual({ book: 'JHN', chapter: 3, verse: 16 });
    expect(parseReference('1co13:4')).toEqual({ book: '1CO', chapter: 13, verse: 4 });
    expect(parseReference('Ps 23')).toEqual({ book: 'PSA', chapter: 23 });
    expect(parseReference('Romans')).toEqual({ book: 'ROM', chapter: 1 });
    expect(parseReference('Rom 8:28-30')).toEqual({ book: 'ROM', chapter: 8, verse: 28, endVerse: 30 });
    expect(parseReference('Rom 8:28–30')).toEqual({ book: 'ROM', chapter: 8, verse: 28, endVerse: 30 });
    expect(parseReference('Gen 1:1-2:3')).toEqual({ book: 'GEN', chapter: 1, verse: 1, endChapter: 2, endVerse: 3 });
    expect(parseReference('Ps 1-3')).toEqual({ book: 'PSA', chapter: 1 });
    expect(parseReference('Song of Solomon 2:4')).toEqual({ book: 'SNG', chapter: 2, verse: 4 });
    expect(parseReference('John 3v16')).toEqual({ book: 'JHN', chapter: 3, verse: 16 });
    expect(parseReference('Jn 3:16, 18')).toEqual({ book: 'JHN', chapter: 3, verse: 16 });
  });

  it('never reads a period or a book name ending in "v" as a verse separator', () => {
    expect(parseReference('Ps. 31')).toEqual({ book: 'PSA', chapter: 31 });
    expect(parseReference('Lev 8')).toEqual({ book: 'LEV', chapter: 8 });
    expect(parseReference('Rev 12')).toEqual({ book: 'REV', chapter: 12 });
    expect(parseReference('Lev 8:3')).toEqual({ book: 'LEV', chapter: 8, verse: 3 });
    expect(parseReference('Rev. 22:21')).toEqual({ book: 'REV', chapter: 22, verse: 21 });
    expect(parseReference('Gen. 1:1')).toEqual({ book: 'GEN', chapter: 1, verse: 1 });
    expect(parseReference('1 Sam. 17')).toEqual({ book: '1SA', chapter: 17 });
  });

  it('treats a lone number after a one-chapter book as a verse', () => {
    expect(parseReference('Jude 3')).toEqual({ book: 'JUD', chapter: 1, verse: 3 });
    expect(parseReference('Jude 1:3')).toEqual({ book: 'JUD', chapter: 1, verse: 3 });
    expect(parseReference('Phm 4-6')).toEqual({ book: 'PHM', chapter: 1, verse: 4, endVerse: 6 });
    expect(parseReference('3 John 4')).toEqual({ book: '3JN', chapter: 1, verse: 4 });
    expect(parseReference('Obadiah')).toEqual({ book: 'OBA', chapter: 1 });
  });

  it('rejects impossible references', () => {
    expect(parseReference('Jn 22')).toBeNull();
    expect(parseReference('Gen 0')).toBeNull();
    expect(parseReference('Rom 8:30-28')).toBeNull();
    expect(parseReference('nonsense 3:16')).toBeNull();
    expect(parseReference('')).toBeNull();
  });

  it('checks verse numbers when a versification is supplied', () => {
    const counts = (book: string, chapter: number) => (book === 'JHN' && chapter === 3 ? 36 : 50);
    expect(parseReference('Jn 3:36', counts)).not.toBeNull();
    expect(parseReference('Jn 3:37', counts)).toBeNull();
  });
});

describe('compact refs and verse ids', () => {
  it('round-trips compact strings', () => {
    for (const s of ['JHN.3', 'JHN.3.16', 'JHN.3.16-18', 'GEN.1.1-2.3', '1CO.13.4']) {
      expect(toCompact(fromCompact(s)!)).toBe(s);
    }
    expect(fromCompact('XYZ.1.1')).toBeNull();
  });

  it('round-trips verse ids', () => {
    expect(verseId('JHN', 3, 16)).toBe(43_003_016);
    expect(fromVerseId(43_003_016)).toEqual({ book: 'JHN', chapter: 3, verse: 16 });
    expect(fromVerseId(verseId('REV', 22, 21))).toEqual({ book: 'REV', chapter: 22, verse: 21 });
  });

  it('tests whether a ref covers a verse', () => {
    const range = fromCompact('GEN.1.26-2.3')!;
    expect(refContainsVerse(range, 'GEN', 1, 31)).toBe(true);
    expect(refContainsVerse(range, 'GEN', 2, 3)).toBe(true);
    expect(refContainsVerse(range, 'GEN', 2, 4)).toBe(false);
    expect(refContainsVerse(range, 'GEN', 1, 25)).toBe(false);
    expect(refContainsVerse(fromCompact('PSA.23')!, 'PSA', 23, 6)).toBe(true);
    expect(refContainsVerse(fromCompact('JHN.3.16')!, 'JHN', 3, 17)).toBe(false);
  });
});

describe('versification', async () => {
  const { TOTAL_VERSES, verseAtOrdinal, verseCount, verseOrdinal } = await import('./versification');
  it('matches the KJV verse counts', () => {
    expect(TOTAL_VERSES).toBe(31102);
    expect(verseCount('JHN', 3)).toBe(36);
    expect(verseCount('PSA', 119)).toBe(176);
    expect(verseCount('3JN', 1)).toBe(14);
    expect(verseCount('REV', 12)).toBe(17);
    expect(verseCount('MAL', 4)).toBe(6);
  });
  it('maps verses to canonical ordinals and back', () => {
    expect(verseOrdinal('GEN', 1, 1)).toBe(0);
    expect(verseOrdinal('REV', 22, 21)).toBe(31101);
    expect(verseAtOrdinal(verseOrdinal('JHN', 3, 16))).toEqual({ bookIndex: 43, chapter: 3, verse: 16 });
    expect(verseAtOrdinal(31101)).toEqual({ bookIndex: 66, chapter: 22, verse: 21 });
  });
});
