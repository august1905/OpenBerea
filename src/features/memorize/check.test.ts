import { describe, expect, it } from 'vitest';

import { fromCompact } from '@/lib/bible/refs';

import {
  answerMatches,
  checkFirstLetter,
  checkReference,
  diffText,
  diffWords,
  firstLetterShow,
  firstLetterStart,
  firstLetterType,
  refSpan,
  refVerseTotal,
} from './check';
import { tokenize } from './tokenize';

const JN316 = 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';

describe('first letter', () => {
  it('checks one key, ignoring case and punctuation', () => {
    const [word] = tokenize('Lord’s');
    expect(checkFirstLetter(word, 'l')).toBe('ok');
    expect(checkFirstLetter(word, 'L')).toBe('ok');
    expect(checkFirstLetter(word, 'k')).toBe('miss');
    expect(checkFirstLetter(word, ',')).toBe('ignore');
    expect(checkFirstLetter(word, ' ')).toBe('ignore');
  });

  it('reveals words on correct letters and counts wrong letters as misses', () => {
    const words = tokenize('For God so loved');
    let s = firstLetterStart(words.length);
    s = firstLetterType(s, words, 'F G');
    expect(s.index).toBe(2);
    s = firstLetterType(s, words, 'x');
    expect(s.index).toBe(2);
    expect(s.missed[2]).toBe(true);
    expect(s.wrong[2]).toEqual(['x']);
    s = firstLetterType(s, words, 'sl');
    expect(s.index).toBe(4);
    expect(s.missed).toEqual([false, false, true, false]);
    // Typing past the end does nothing.
    expect(firstLetterType(s, words, 'abc')).toBe(s);
  });

  it('can show the current word, counted as missed', () => {
    const words = tokenize('For God');
    const s = firstLetterShow(firstLetterStart(words.length), words.length);
    expect(s.index).toBe(1);
    expect(s.missed[0]).toBe(true);
  });
});

describe('answer normalization', () => {
  it('is lenient about case, punctuation, and archaic forms', () => {
    expect(answerMatches('Lord’s', "lord's")).toBe(true);
    expect(answerMatches('Lord’s', 'LORDS')).toBe(true);
    expect(answerMatches('lovingkindness', 'loving-kindness')).toBe(true);
    expect(answerMatches('lovingkindness', 'Loving kindness')).toBe(true);
    expect(answerMatches('world,', ' World ')).toBe(true);
    expect(answerMatches('Beth–el', 'Bethel')).toBe(true);
    expect(answerMatches('hath', 'has')).toBe(false);
    expect(answerMatches('loved', '')).toBe(false);
  });
});

describe('word diff', () => {
  const expected = tokenize(JN316).map((w) => w.text);

  it('scores a perfect recitation at 100%', () => {
    const r = diffText(expected, JN316.toLowerCase().replace(/[,.]/g, ''));
    expect(r.correct).toBe(expected.length);
    expect(r.missed).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.accuracy).toBe(1);
  });

  it('marks missed and extra words', () => {
    const r = diffWords(['For', 'God', 'so', 'loved', 'the', 'world'], ['For', 'God', 'really', 'loved', 'world']);
    expect(r.ops.map((o) => `${o.kind}:${o.text}`)).toEqual(['ok:For', 'ok:God', 'missed:so', 'extra:really', 'ok:loved', 'missed:the', 'ok:world']);
    expect(r.correct).toBe(4);
    expect(r.missed).toEqual(['so', 'the']);
    expect(r.extra).toEqual(['really']);
    expect(r.total).toBe(7);
    expect(r.accuracy).toBeCloseTo(4 / 7);
  });

  it('handles empty input and archaic spellings', () => {
    expect(diffWords(['a', 'b'], []).missed).toEqual(['a', 'b']);
    expect(diffWords(['a', 'b'], []).accuracy).toBe(0);
    expect(diffText(['his', 'name’s', 'sake'], "his names' sake").accuracy).toBe(1);
  });
});

describe('references', () => {
  const target = fromCompact('JHN.3.16')!;

  it('accepts typed abbreviations', () => {
    expect(checkReference('Jn 3:16', target).result).toBe('correct');
    expect(checkReference('john 3.16', target).result).toBe('correct');
    expect(checkReference('Rom 8:28', fromCompact('ROM.8.28')!).result).toBe('correct');
  });

  it('gives gentle partial feedback', () => {
    expect(checkReference('John 3:15-17', target).result).toBe('close');
    expect(checkReference('John 3:15', target).result).toBe('chapter');
    expect(checkReference('John 4:16', target).result).toBe('book');
    expect(checkReference('Rom 3:16', target).result).toBe('wrong');
    expect(checkReference('banana', target).result).toBe('invalid');
    expect(checkReference('', target).result).toBe('invalid');
  });

  it('treats a chapter and its full verse range as the same passage', () => {
    expect(checkReference('Psalm 23', fromCompact('PSA.23.1-6')!).result).toBe('correct');
    expect(checkReference('Ps 23:1-6', fromCompact('PSA.23')!).result).toBe('correct');
    expect(checkReference('Ps 23:1-3', fromCompact('PSA.23')!).result).toBe('close');
  });

  it('measures spans', () => {
    expect(refSpan(fromCompact('PSA.23')!)).toEqual([[23, 1], [23, 6]]);
    expect(refVerseTotal(fromCompact('PSA.23')!)).toBe(6);
    expect(refVerseTotal(fromCompact('ROM.8.28-30')!)).toBe(3);
    expect(refVerseTotal(fromCompact('GEN.1.31-2.3')!)).toBe(4);
  });
});
