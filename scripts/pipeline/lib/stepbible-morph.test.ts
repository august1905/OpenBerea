import { describe, expect, it } from 'vitest';

import { decodeBrief, parseMorphFile } from './stepbible-morph';

// Abridged from TEHMC/TEGMC at commit b99716b: the brief table, the start of the full section, and
// records as they appear (including TEGMC's malformed V-PMO-1S block with a form feed and an
// alternate V-PMO-3P layout).
const TEHMC = [
  'BRIEF LEXICAL MORPHOLOGY CODES: ',
  'Code\tExample in English\tMeaning',
  '====================================================',
  'H: ...\telohim\tHebrew word',
  'H:A\tyoung\tHebrew Adjective',
  'H:N-M\tman\tHebrew Noun (Masculine)',
  'H:V\tto rise\tHebrew Verb',
  'N:N-M-P \tDavid\tProper Name of a Male Person',
  'N:N--L\tJerusalem\tProper Name of a Location',
  'Ps3m\this\tPossessive suffix: 3rd person masculine singular',
  '',
  'FULL MORPHOLOGY CODES:',
  '================',
  'line 1: Codes + expansion\t- based on OpenScripture codes',
  '',
  '$',
  'HC\tFunction=Conjunction ',
  '\tConjunction',
  '\ta conjunction',
  '\t"giving to‚ rich _and_ poor": "and"',
  '$',
  'HVqp3ms\tFunction=Verb ; Stem=Qal (hence Action=Simple; Voice=Active); Form=Perfect (hence Tense=Past/present; Mood=Indicative); Person=Third; Gender=Masculine; Number=Singular',
  '\t"Verb : Qal (Simple, Active) Perfect (Past/present Indicative) Third Singular Masculine"',
  '\tperforming an ACTION OR ACTIVITY that is done completely in the past or present by a male person or thing being discussed',
  '\tExample: he/it did or does rise',
  '$',
];

const TEGMC = [
  'Code\tExample in English\tMeaning',
  '====================================================',
  'G:V\tto lord\tGreek Verb',
  'G:CONJ\tand\tGreek Conjunction',
  'FULL MORPHOLOGY CODES:',
  '"1 CODE"\tGroup#1\tspecific Function',
  '$',
  'V-AAI-3S\tFunction=Verb; Tense=Aorist; Voice=Active; Mood=Indicative; Person=3rd; Number=Singular',
  '\tVerb Aorist Active Indicative 3rd Singular',
  '\tan ACTION that happened - by a person or thing being discussed',
  '\t"_he/she/it taught _"',
  '$',
  'V-PMO-1S\tFunction=Verb; Tense=Present; Voice=Middle; Mood=Optative; Person=1st; Number=Singular',
  '\tVerb Present Middle Optative 1st Singular ',
  '\tan ACTION that hopefully happens to or for a person or thing that is speaking or writing ',
  '\t"_I hopefully am taught myself_"',
  '\fV-PMO-3P',
  'V-PMO-3P\t-1\tVerb\tPresent\tMiddle\tOptative\t3rd\t\tPlural',
  '$',
  'X-NSN\tFunction=Indefinite pronoun; Case=Nominative; Number=Singular; Gender=Neuter',
  '\tIndefinite pronoun Nominative Singular Neuter ',
  '\ta generalising reference to a neuter person or thing that is doing something ',
  '\t"a _certain_ nation gave something"',
  '',
  '',
  'HEB\tKJV',
  'S-1PASM\tKJV',
];

describe('parseMorphFile', () => {
  it('reads full Hebrew records keyed by code', () => {
    const { full, brief } = parseMorphFile(TEHMC);
    expect(Object.keys(full)).toEqual(['HC', 'HVqp3ms']);
    expect(full.HVqp3ms).toEqual({
      p: 'Verb : Qal (Simple, Active) Perfect (Past/present Indicative) Third Singular Masculine',
      e: 'performing an ACTION OR ACTIVITY that is done completely in the past or present by a male person or thing being discussed',
      x: 'Example: he/it did or does rise',
    });
    expect(full.HC.x).toBe('"giving to‚ rich _and_ poor": "and"');
    expect(brief['H:N-M']).toBe('Hebrew Noun (Masculine)');
    expect(brief['N:N-M-P']).toBe('Proper Name of a Male Person');
  });

  it('takes only the first four lines of malformed Greek records', () => {
    const { full } = parseMorphFile(TEGMC);
    expect(Object.keys(full)).toEqual(['V-AAI-3S', 'V-PMO-1S', 'X-NSN']);
    expect(full['V-PMO-1S']).toEqual({
      p: 'Verb Present Middle Optative 1st Singular',
      e: 'an ACTION that hopefully happens to or for a person or thing that is speaking or writing',
      x: '"_I hopefully am taught myself_"',
    });
    expect(full['X-NSN'].p).toBe('Indefinite pronoun Nominative Singular Neuter');
    expect(full.HEB).toBeUndefined();
  });
});

describe('decodeBrief', () => {
  const { brief: heb } = parseMorphFile(TEHMC);
  const { brief: grc } = parseMorphFile(TEGMC);

  it('decodes single codes, alternatives and combinations', () => {
    expect(decodeBrief('H:N-M', heb)).toBe('Hebrew Noun (Masculine)');
    expect(decodeBrief('N:N-M-P / N:N--L', heb)).toBe('Proper Name of a Male Person OR Proper Name of a Location');
    expect(decodeBrief('G:V + G:CONJ', grc)).toBe('Greek Verb + Greek Conjunction');
    expect(decodeBrief('N:N--L', grc, heb)).toBe('Proper Name of a Location');
  });

  it('decodes Aramaic codes from the Hebrew description', () => {
    expect(decodeBrief('A:N-M', heb)).toBe('Aramaic Noun (Masculine)');
    expect(decodeBrief('A:Q', heb)).toBeUndefined();
    expect(decodeBrief('', heb)).toBeUndefined();
  });
});
