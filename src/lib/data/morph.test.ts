import { describe, expect, it } from 'vitest';

import { describeMorph, morphTablePath, splitMorph } from './morph';
import type { MorphEntry } from './types';

// Entries as written to stepbible/morph/{hbo,grc}.json (from TEHMC/TEGMC, STEPBible commit b99716b).
const HBO: Record<string, MorphEntry> = {
  HR: { p: 'Preposition', e: 'a RELATIONSHIP to another person or thing', x: '"_of‚ from‚ by‚ in_": "_of‚ to, from‚ in_"' },
  HNcfsa: { p: 'Noun (Singular Feminine, Absolute)', e: 'a reference to a female PERSON OR THING', x: 'Example: a (female) person (or thing)' },
  HVqp3ms: {
    p: 'Verb : Qal (Simple, Active) Perfect (Past/present Indicative) Third Singular Masculine',
    e: 'performing an ACTION OR ACTIVITY that is done completely in the past or present by a male person or thing being discussed',
    x: 'Example: he/it did or does rise',
  },
  HPi: { p: 'Interrogative Pronoun', e: 'an INDICATOR that a question is being asked', x: 'Example: who' },
  HTm: { p: 'Demonstrative Particle', e: 'an INDICATOR that is pointing to a specific person or thing', x: 'Example: that' },
};
const GRC: Record<string, MorphEntry> = {
  'V-AAI-3S': { p: 'Verb Aorist Active Indicative 3rd Singular', e: 'an ACTION that happened - by a person or thing being discussed', x: '"_he/she/it taught _"' },
  'P-1NS': {
    p: 'Personal pronoun 1st Nominative Singular',
    e: 'a reference to a recently mentioned person or thing that is speaking or writing that is doing something',
    x: '"_I_ give to them"',
  },
  CONJ: { p: 'Conjunction', e: 'a conjunction', x: '"giving to‚ rich _and_ poor"' },
};

describe('splitMorph', () => {
  it('splits Hebrew codes and prefixes each part with the language letter', () => {
    expect(splitMorph('HR/Ncfsa', 'hbo')).toEqual(['HR', 'HNcfsa']);
    expect(splitMorph('HC/Td/Ncfsa', 'hbo')).toEqual(['HC', 'HTd', 'HNcfsa']);
    expect(splitMorph('HNcmpc/Sp2ms', 'hbo')).toEqual(['HNcmpc', 'HSp2ms']);
    expect(splitMorph('HVqp3ms', 'hbo')).toEqual(['HVqp3ms']);
    expect(splitMorph('ATd/Ncmsd', 'hbo')).toEqual(['ATd', 'ANcmsd']);
  });

  it('skips empty parts (two words joined in one row)', () => {
    expect(splitMorph('HVqp3ms//Ncmsa', 'hbo')).toEqual(['HVqp3ms', 'HNcmsa']);
    expect(splitMorph('HPi//Tm', 'hbo')).toEqual(['HPi', 'HTm']);
    expect(splitMorph('', 'hbo')).toEqual([]);
  });

  it('splits Greek crasis forms on " + " and drops Strong numbers', () => {
    expect(splitMorph('V-AAI-3S', 'grc')).toEqual(['V-AAI-3S']);
    expect(splitMorph('P-1NS + CONJ', 'grc')).toEqual(['P-1NS', 'CONJ']);
    expect(splitMorph('G1473=P-1NS + G2532=CONJ', 'grc')).toEqual(['P-1NS', 'CONJ']);
    expect(splitMorph('N-NSM-T', 'grc')).toEqual(['N-NSM-T']);
  });
});

describe('describeMorph', () => {
  it('gives plain-English parsing for each part', () => {
    expect(describeMorph('HR/Ncfsa', 'hbo', HBO)).toEqual([
      { key: 'HR', parsing: 'Preposition', explanation: 'a RELATIONSHIP to another person or thing', example: HBO.HR.x, known: true },
      {
        key: 'HNcfsa',
        parsing: 'Noun (Singular Feminine, Absolute)',
        explanation: 'a reference to a female PERSON OR THING',
        example: 'Example: a (female) person (or thing)',
        known: true,
      },
    ]);
    expect(describeMorph('HPi//Tm', 'hbo', HBO).map((p) => p.parsing)).toEqual(['Interrogative Pronoun', 'Demonstrative Particle']);
    expect(describeMorph('HVqp3ms', 'hbo', HBO)[0]).toMatchObject({
      parsing: 'Verb : Qal (Simple, Active) Perfect (Past/present Indicative) Third Singular Masculine',
      example: 'Example: he/it did or does rise',
    });
    expect(describeMorph('G1473=P-1NS + G2532=CONJ', 'grc', GRC).map((p) => p.parsing)).toEqual([
      'Personal pronoun 1st Nominative Singular',
      'Conjunction',
    ]);
  });

  it('returns the key itself for unknown codes', () => {
    expect(describeMorph('HXyz', 'hbo', HBO)).toEqual([{ key: 'HXyz', parsing: 'HXyz', known: false }]);
    expect(describeMorph('toString', 'grc', GRC)[0].known).toBe(false);
  });

  it('names the table file', () => {
    expect(morphTablePath('grc')).toBe('stepbible/morph/grc.json');
  });
});
