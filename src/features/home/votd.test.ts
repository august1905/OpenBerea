import { describe, expect, it } from 'vitest';

import { fromCompact } from '@/lib/bible/refs';
import { verseCount } from '@/lib/bible/versification';

import votd from '../../../content/votd.json';
import { dayOfYear, verseOfTheDay } from './votd';

describe('verse of the day', () => {
  it('lists only valid KJV references, without duplicates', () => {
    expect(new Set(votd.verses).size).toBe(votd.verses.length);
    for (const s of votd.verses) {
      const ref = fromCompact(s);
      expect(ref, s).not.toBeNull();
      expect(ref!.verse! <= verseCount(ref!.book, ref!.chapter), s).toBe(true);
      if (ref!.endVerse) expect(ref!.endVerse <= verseCount(ref!.book, ref!.chapter), s).toBe(true);
    }
  });

  it('picks by date and is stable through the day', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
    expect(verseOfTheDay(new Date(2026, 0, 1, 0, 1))).toBe(votd.verses[0]);
    expect(verseOfTheDay(new Date(2026, 0, 1, 23, 59))).toBe(votd.verses[0]);
    expect(verseOfTheDay(new Date(2026, 0, 2))).toBe(votd.verses[1]);
    const n = votd.verses.length;
    expect(verseOfTheDay(new Date(2026, 0, 1 + n))).toBe(votd.verses[0]);
  });
});
