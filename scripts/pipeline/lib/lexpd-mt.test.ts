import { describe, expect, it } from 'vitest';

import { MtToKjv, parseSrc } from './lexpd-mt';

// Verse lists as in stepbible/orig (KJV numbers, Hebrew number in `src` when it differs).
const PSA11 = { b: 'PSA' as const, c: 11, v: [{ n: 0, src: '11:1' }, { n: 1 }, { n: 2 }, { n: 7 }] };
const PSA13 = {
  b: 'PSA' as const,
  c: 13,
  v: [{ n: 0, src: '13:1' }, { n: 1, src: '13:2' }, { n: 4, src: '13:5' }, { n: 5, src: '13:6' }, { n: 6 }],
};
const PSA51 = { b: 'PSA' as const, c: 51, v: [{ n: 0, src: '51:1-2' }, { n: 1, src: '51:3' }, { n: 10, src: '51:12' }] };
const JOL2 = { b: 'JOL' as const, c: 2, v: [{ n: 27 }, { n: 28, src: '3:1' }, { n: 32, src: '3:5' }] };
const JOL3 = { b: 'JOL' as const, c: 3, v: [{ n: 1, src: '4:1' }, { n: 21, src: '4:21' }] };
const MAL3 = { b: 'MAL' as const, c: 3, v: [{ n: 1 }, { n: 18 }] };
const MAL4 = { b: 'MAL' as const, c: 4, v: [{ n: 1, src: '3:19' }, { n: 6, src: '3:24' }] };
const ISA28 = { b: 'ISA' as const, c: 28, v: [{ n: 1 }, { n: 29 }] };

function map() {
  const mt = new MtToKjv();
  for (const ch of [PSA11, PSA13, PSA51, JOL2, JOL3, MAL3, MAL4, ISA28]) mt.addChapter(ch);
  return mt;
}

describe('Hebrew → KJV verse numbers', () => {
  it('parses src values', () => {
    expect(parseSrc('18:1')).toEqual([[18, 1]]);
    expect(parseSrc('10:4-5')).toEqual([[10, 4], [10, 5]]);
    expect(parseSrc('25:19-26:1')).toEqual([[25, 19], [26, 1]]);
    expect(parseSrc('x')).toBeNull();
  });

  it('maps renumbered verses and keeps identical ones', () => {
    const mt = map();
    expect(mt.verse('JOL', 3, 1)).toEqual({ chapter: 2, verse: 28 });
    expect(mt.verse('JOL', 4, 21)).toEqual({ chapter: 3, verse: 21 });
    expect(mt.verse('MAL', 3, 19)).toEqual({ chapter: 4, verse: 1 });
    expect(mt.verse('PSA', 51, 12)).toEqual({ chapter: 51, verse: 10 });
    expect(mt.verse('ISA', 28, 29)).toEqual({ chapter: 28, verse: 29 });
    expect(mt.verse('JOL', 2, 28)).toBeUndefined(); // the Hebrew Joel 2 has 27 verses
  });

  it('prefers a real verse to a title, then an explicit src', () => {
    const mt = map();
    expect(mt.verse('PSA', 11, 1)).toEqual({ chapter: 11, verse: 1 }); // title + v.1 in one Hebrew verse
    expect(mt.verse('PSA', 13, 1)).toEqual({ chapter: 13, verse: 0 }); // the title alone
    expect(mt.verse('PSA', 13, 6)).toEqual({ chapter: 13, verse: 5 }); // KJV 13:5-6
    expect(mt.verse('PSA', 51, 2)).toEqual({ chapter: 51, verse: 0 }); // two-verse title
  });

  it('maps a whole chapter only when it holds the same verses', () => {
    const mt = map();
    expect(mt.chapter('ISA', 28)).toBe(28);
    expect(mt.chapter('MAL', 3)).toBeUndefined(); // Hebrew Mal 3 = KJV 3 + 4
    expect(mt.chapter('JOL', 4)).toBe(3);
    expect(mt.chapter('PSA', 51)).toBe(51);
  });
});
