import { describe, expect, it } from 'vitest';

import { isLetter, normalizeWord, tokenize, wordsOf } from './tokenize';

describe('tokenize', () => {
  it('separates words from punctuation', () => {
    const words = tokenize('The Lord is my shepherd; I shall not want.');
    expect(words.map((w) => w.text)).toEqual(['The', 'Lord', 'is', 'my', 'shepherd', 'I', 'shall', 'not', 'want']);
    expect(words[4].post).toBe(';');
    expect(words[8].post).toBe('.');
    expect(words.map((w) => w.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('keeps KJV apostrophes and hyphens inside words', () => {
    const words = tokenize('for his name’s sake. the Lord\'s house, the sons’ wives; Beth–el, God-ward, lovingkindness: he hath said');
    expect(words.map((w) => w.text)).toEqual([
      'for', 'his', 'name’s', 'sake', 'the', "Lord's", 'house', 'the', 'sons’', 'wives', 'Beth–el', 'God-ward', 'lovingkindness', 'he', 'hath', 'said',
    ]);
    expect(words.find((w) => w.text === 'name’s')!.norm).toBe('names');
    expect(words.find((w) => w.text === "Lord's")!.norm).toBe('lords');
    expect(words.find((w) => w.text === 'Beth–el')!.norm).toBe('bethel');
    expect(words.find((w) => w.text === 'sons’')!.post).toBe('');
  });

  it('treats em dashes and brackets as punctuation', () => {
    const words = tokenize('and live for ever— And the Lord said, [Selah');
    expect(words.map((w) => w.text)).toEqual(['and', 'live', 'for', 'ever', 'And', 'the', 'Lord', 'said', 'Selah']);
    expect(words[3].post).toBe('—');
    expect(words[8].pre).toBe('[');

    const glued = tokenize('their sin—; and if not');
    expect(glued.map((w) => w.text)).toEqual(['their', 'sin', 'and', 'if', 'not']);
    expect(glued[1].post).toBe('—;');

    const joined = tokenize('ever—and');
    expect(joined.map((w) => w.text)).toEqual(['ever', 'and']);
    expect(joined[1].glue).toBe(true);
  });

  it('handles parentheses and leading punctuation', () => {
    const words = tokenize('(for he was a priest) and');
    expect(words[0].pre).toBe('(');
    expect(words[4].post).toBe(')');
    expect(words[5].pre).toBe('');
  });

  it('records first letters and offsets', () => {
    const words = tokenize('  Ænon near to Salim');
    expect(words[0].first).toBe('a');
    expect(words[0].at).toBe(2);
    expect(words[3].first).toBe('s');
  });
});

describe('normalizeWord', () => {
  it('ignores case, accents, apostrophes, and hyphens', () => {
    expect(normalizeWord('LORD’S')).toBe('lords');
    expect(normalizeWord('loving-kindness')).toBe('lovingkindness');
    expect(normalizeWord('Beth–el')).toBe('bethel');
    expect(normalizeWord('naïve')).toBe('naive');
    expect(normalizeWord('world,')).toBe('world');
    expect(normalizeWord('…')).toBe('');
  });
});

describe('wordsOf and isLetter', () => {
  it('splits typed text into words', () => {
    expect(wordsOf('  For God so   loved the world,that he')).toEqual(['For', 'God', 'so', 'loved', 'the', 'world', 'that', 'he']);
  });

  it('accepts only letters as keys', () => {
    expect(isLetter('f')).toBe(true);
    expect(isLetter('F')).toBe(true);
    expect(isLetter(' ')).toBe(false);
    expect(isLetter(',')).toBe(false);
    expect(isLetter('3')).toBe(false);
  });
});
