import { describe, expect, it } from 'vitest';

import { hashSeed, scrambleOrder, seededRandom, shuffle } from './shuffle';
import { hideCounts, hiddenInRound, hideOrder, isKeyWord, pickBlanks } from './hide';
import { tokenize } from './tokenize';

describe('seeded shuffle', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(items, 42)).toEqual(shuffle(items, 42));
    expect(shuffle(items, 42)).not.toEqual(shuffle(items, 43));
    expect([...shuffle(items, 7)].sort((a, b) => a - b)).toEqual(items);
    expect(items[0]).toBe(0); // input untouched
  });

  it('produces numbers in [0, 1)', () => {
    const r = seededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('hashes parts into stable seeds', () => {
    expect(hashSeed('JHN.3.16', 'scramble', 1)).toBe(hashSeed('JHN.3.16', 'scramble', 1));
    expect(hashSeed('JHN.3.16', 'scramble', 1)).not.toBe(hashSeed('JHN.3.16', 'scramble', 2));
  });

  it('never leaves a scramble in its original order', () => {
    for (let seed = 0; seed < 300; seed++) {
      const order = scrambleOrder(2, seed);
      expect(order).toEqual([1, 0]);
    }
    for (let seed = 0; seed < 100; seed++) {
      const order = scrambleOrder(5, seed);
      expect(order.every((v, i) => v === i)).toBe(false);
      expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
    }
    expect(scrambleOrder(1, 3)).toEqual([0]);
    expect(scrambleOrder(0, 3)).toEqual([]);
  });
});

describe('hide schedule', () => {
  it('hides 20%, 40%, … 100% after a read-through', () => {
    expect(hideCounts(10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(hideCounts(25)).toEqual([0, 5, 10, 15, 20, 25]);
  });

  it('always hides at least one more word each round', () => {
    expect(hideCounts(3)).toEqual([0, 1, 2, 3]);
    expect(hideCounts(1)).toEqual([0, 1]);
    expect(hideCounts(0)).toEqual([0]);
    const counts = hideCounts(7);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    expect(counts[counts.length - 1]).toBe(7);
  });

  it('keeps hidden words hidden in later rounds', () => {
    const order = hideOrder(12, 99);
    const counts = hideCounts(12);
    let prev = new Set<number>();
    for (let r = 0; r < counts.length; r++) {
      const hidden = hiddenInRound(order, counts, r);
      expect(hidden.size).toBe(counts[r]);
      for (const i of prev) expect(hidden.has(i)).toBe(true);
      prev = hidden;
    }
    expect(prev.size).toBe(12);
  });
});

describe('fill in the blank', () => {
  const words = tokenize('For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.');

  it('blanks about a quarter of the words, choosing key words', () => {
    const blanks = pickBlanks(words, 5);
    expect(blanks.length).toBe(Math.round(words.length * 0.25));
    for (const i of blanks) expect(isKeyWord(words[i])).toBe(true);
    expect([...blanks].sort((a, b) => a - b)).toEqual(blanks);
    for (let k = 1; k < blanks.length; k++) expect(blanks[k] - blanks[k - 1]).toBeGreaterThan(1);
    expect(pickBlanks(words, 5)).toEqual(blanks);
  });

  it('skips function words and always blanks something', () => {
    expect(isKeyWord({ norm: 'the' })).toBe(false);
    expect(isKeyWord({ norm: 'unto' })).toBe(false);
    expect(isKeyWord({ norm: 'shepherd' })).toBe(true);
    expect(pickBlanks(tokenize('and the of'), 1)).toHaveLength(1);
    expect(pickBlanks([], 1)).toEqual([]);
  });
});
