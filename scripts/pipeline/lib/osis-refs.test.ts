import { describe, expect, it } from 'vitest';

import { bookToOsis, osisToBook } from './osis-books';
import { compactValid, osisRefToCompact } from './osis-refs';

const ok = (s: string) => {
  const r = osisRefToCompact(s);
  return 'ref' in r ? r.ref : `ERROR: ${r.error}`;
};

describe('OSIS book ids', () => {
  it('maps OSIS ids to the app’s book codes and back', () => {
    expect(osisToBook('Gen')).toBe('GEN');
    expect(osisToBook('Ps')).toBe('PSA');
    expect(osisToBook('Song')).toBe('SNG');
    expect(osisToBook('1John')).toBe('1JN');
    expect(osisToBook('Phlm')).toBe('PHM');
    expect(osisToBook('2Macc')).toBeNull();
    expect(bookToOsis('JHN')).toBe('John');
    expect(bookToOsis('EZK')).toBe('Ezek');
  });
});

describe('osisRefToCompact', () => {
  it('converts verses, ranges, cross-chapter ranges, and chapters (TSK samples)', () => {
    expect(ok('Rom.5.8')).toBe('ROM.5.8');
    expect(ok('2Cor.5.19-2Cor.5.21')).toBe('2CO.5.19-21');
    expect(ok('1John.4.9-1John.4.10')).toBe('1JN.4.9-10');
    expect(ok('Gen.1.1-Gen.2.3')).toBe('GEN.1.1-2.3');
    expect(ok('John.3.1-John.3.21')).toBe('JHN.3.1-21');
    expect(ok('Ps.23')).toBe('PSA.23');
    expect(ok('Rom.5.8-Rom.5.8')).toBe('ROM.5.8');
  });

  it('accepts abbreviated range ends, a Bible: prefix, grains, and common abbreviations', () => {
    expect(ok('Rom.5.8-10')).toBe('ROM.5.8-10');
    expect(ok('Gen.1.1-2.3')).toBe('GEN.1.1-2.3');
    expect(ok('Bible:Exod.6.20')).toBe('EXO.6.20');
    expect(ok('John.3.16!a')).toBe('JHN.3.16');
    expect(ok('Ge.17.20')).toBe('GEN.17.20');
    expect(ok('Gen.1.30-Gen.2')).toBe('GEN.1.30-2.25');
  });

  it('shortens chapter ranges to their first chapter and says so', () => {
    expect(osisRefToCompact('Ps.1-Ps.2')).toEqual({ ref: 'PSA.1', note: 'chapter range shortened to its first chapter' });
  });

  it('rejects what is outside the KJV versification or cannot be expressed', () => {
    expect(ok('2Macc.12.29')).toMatch(/unknown book/);
    expect(ok('strong:G1497')).toMatch(/not a Bible reference/);
    expect(ok('Jas.9.7')).toMatch(/chapter 9 not in JAS/);
    expect(ok('Exod.7.26')).toMatch(/not in the KJV versification/);
    expect(ok('Num.15.4-Num.7.28')).toMatch(/backwards/);
    expect(ok('Matt.1.1-Mark.1.1')).toMatch(/cross-book/);
    expect(ok('John.1.3 John.1.10')).toMatch(/cannot parse/);
  });
});

describe('compactValid', () => {
  it('accepts refs that exist in the KJV versification', () => {
    for (const r of ['JHN.3.16', 'ROM.8.28-30', 'GEN.1.1-2.3', 'PSA.23', 'JUD.1.25']) expect(compactValid(r)).toBe(true);
  });

  it('rejects verses past the end of a chapter and malformed ranges', () => {
    for (const r of ['JOS.17.1-19', 'JHN.3.37', 'JUD.2.1', 'ROM.8.30-28', 'GEN.2.1-1.3', 'JHN.3.16-16', 'XYZ.1.1']) {
      expect(compactValid(r)).toBe(false);
    }
  });
});
