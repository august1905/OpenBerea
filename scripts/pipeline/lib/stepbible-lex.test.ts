import { describe, expect, it } from 'vitest';

import { blocksToText } from './richtext';
import {
  definitionSource,
  isKjvRef,
  LexIds,
  lexEntry,
  parseLexRow,
  parseStepRefList,
  rewriteStepRefs,
  splitRefText,
  tbesgDefinition,
} from './stepbible-lex';

// Rows copied from TBESH/TBESG at commit b99716b.
const row = (...f: string[]) => f.join('\t');
const TBESH_H430 = row('H0430', 'H0430G = a Name of', 'H3068G', 'אֱלֹהִים', 'e.lo.him', 'H:N-M', 'God', 'This name means  "gods" (plural intensive-singular meaning), "God"<BR>Another name of <i>ye.ho.vah</i> (יהוה "LORD" H3068G) ');
const TBESH_H1254 = row('H1254a', 'H1254A =', 'H1254A', 'בָּרָא', 'ba.ra', 'H:V', 'to create', '1) to create, shape, form<br>1a) (Qal) to shape, fashion, create (always with God as subject)<br>1a1) of heaven and earth');
const TBESG_G1H = row('G0001', 'G0001H =', 'G0001H', 'ἆ', 'a', 'G:INJ', 'ah!', " <b>ἔα</b>, <BR /><i>interj.</i>, <BR />expressing surprise, indignation, fear (in cl. chiefly in poët.), <b>ah! ha!</b>: <ref='Luk.4.34.'>Luk.4:34.</ref>† <BR /> (AS)");
const TBESG_ML = row('G6962', 'G6962 =', 'G6962', 'δορά', 'dora', 'G:N-F', 'skin', '<b>a skin, hide </b>, (Theognis Elegiacus) (ML)');
const TBESG_STEP = row('G21267', 'G21267 =', 'G21267', 'ὗλις', 'hulis', '', 'mud', 'mud');
// Part of the G0025 (ἀγαπάω) definition, with its nested/malformed ref.
const G25_PART =
  " <b>ἀγαπάω</b>, -ῶ, <BR /><b>to love</b>, to feel and exhibit esteem. <BR />__1. <b>Of human affection, to men</b>: τ. πλησίον, <ref='Mat.5.43'>Mat.5:43;</ref> <ref='Eph.5.25'>Eph.5:25</ref>, <ref='2Ti.4.8, 10'>II <ref='Tim.4.8'>Tim 4:8</ref>, 10</ref>, <ref='1Pe.2.17; 3.10'>1Pe.2:17, 3:10</ref>.<BR /> __2. <b>Of divine love</b>; <BR />__(a) <b>God's love</b>: to men, <ref='Rom.8.37'>Rom.8:37;</ref><BR /> <re><i>SYN.</i>: φιλέω.</re> (AS)";

describe('lexicon rows', () => {
  it('parses TBESH rows and splits the dStrong from its relation note', () => {
    expect(parseLexRow(TBESH_H430)).toMatchObject({
      eStrong: 'H0430',
      dStrong: 'H0430G',
      relation: 'a Name of',
      uStrong: 'H3068G',
      translit: 'e.lo.him',
      morph: 'H:N-M',
      gloss: 'God',
    });
    expect(parseLexRow('eStrong#\tdStrong\tuStrong\tHebrew')).toBeNull();
    expect(parseLexRow('$========== PERSON(s)')).toBeNull();
  });

  it('never carries the TBESH Meaning (Online Bible) into the entry', () => {
    const e = lexEntry(parseLexRow(TBESH_H1254)!, 'hbo', 'Hebrew Verb');
    expect(e).toEqual({ id: 'H1254A', base: 'H1254', lemma: 'בָּרָא', x: 'ba.ra', g: 'to create', pos: 'Hebrew Verb' });
    expect(JSON.stringify(e)).not.toContain('shape');
  });

  it('converts TBESG definitions with their source tag', () => {
    const e = lexEntry(parseLexRow(TBESG_G1H)!, 'grc', 'Greek Interjection');
    expect(e).toMatchObject({ id: 'G0001H', base: 'G1', g: 'ah!', src: 'AS' });
    const text = blocksToText(e.d!);
    expect(text).not.toContain('(AS)');
    expect(e.d!.flatMap((b) => b.c).find((c) => typeof c !== 'string' && c.ref)).toEqual({ t: 'Luk.4:34.', ref: 'LUK.4.34' });
    expect(lexEntry(parseLexRow(TBESG_ML)!, 'grc', undefined).src).toBe('ML');
    const step = lexEntry(parseLexRow(TBESG_STEP)!, 'grc', undefined);
    expect(step).toEqual({ id: 'G21267', base: 'G21267', lemma: 'ὗλις', x: 'hulis', g: 'mud', d: [{ k: 'p', c: ['mud'] }], src: 'STEP' });
    expect(definitionSource('x (ML) ').src).toBe('ML');
  });

  it('turns indentation markers into list items and links every ref', () => {
    const { d, src } = tbesgDefinition(G25_PART);
    expect(src).toBe('AS');
    const refs = d.flatMap((b) => b.c).filter((c) => typeof c !== 'string' && c.ref).map((c) => (c as { ref: string }).ref);
    expect(refs).toEqual(['MAT.5.43', 'EPH.5.25', '2TI.4.8', '2TI.4.10', '1PE.2.17', '1PE.3.10', 'ROM.8.37']);
    expect(d.map((b) => [b.k, b.d])).toEqual([
      ['p', undefined],
      ['p', undefined],
      ['li', 0],
      ['li', 0],
      ['li', 1],
      ['p', undefined],
    ]);
    expect(blocksToText([d[2]])).toBe('1. Of human affection, to men: τ. πλησίον, Mat.5:43; Eph.5:25, II Tim 4:8, 10, 1Pe.2:17, 3:10.');
    expect(blocksToText([d[5]])).toBe('SYN.: φιλέω.');
  });
});

describe('STEP refs', () => {
  it('parses ref lists, inheriting book and chapter', () => {
    expect(parseStepRefList('Job.26.6; 28.22; 31.12')).toEqual(['JOB.26.6', 'JOB.28.22', 'JOB.31.12']);
    expect(parseStepRefList('2Ti.4.8, 10')).toEqual(['2TI.4.8', '2TI.4.10']);
    expect(parseStepRefList('Luk.4.34.')).toEqual(['LUK.4.34']);
    expect(parseStepRefList('Jude.12')).toEqual(['JUD.1.12']);
    expect(parseStepRefList('Jhn.8:7; 20:4, 8')).toEqual(['JHN.8.7', 'JHN.20.4', 'JHN.20.8']);
    expect(parseStepRefList('Tim.4.8')).toEqual([null]);
    expect(parseStepRefList('Psa.29.12')).toEqual([null]); // Psalm 29 has 11 verses in the KJV
  });

  it('flattens nested refs and splits multi-ref text', () => {
    expect(rewriteStepRefs("<ref='2Ti.4.8, 10'>II <ref='Tim.4.8'>Tim 4:8</ref>, 10</ref>")).toBe(
      '<ref osis="2TI.4.8">II Tim 4:8</ref>, <ref osis="2TI.4.10">10</ref>',
    );
    expect(rewriteStepRefs("<ref='Bel.1.14'>Bel 1:14</ref>")).toBe('Bel 1:14');
    expect(splitRefText('Mat.5:43; 6:1;', 2)).toEqual({ pieces: ['Mat.5:43', '6:1'], seps: ['; '], trailing: ';' });
    expect(splitRefText('Act.10:28 22:3', 2)).toEqual({ pieces: ['Act.10:28', '22:3'], seps: [' '], trailing: '' });
  });

  it('checks refs against the KJV versification', () => {
    expect(isKjvRef('JHN.3.16')).toBe(true);
    expect(isKjvRef('PSA.29.12')).toBe(false);
    expect(isKjvRef('JHN.3.16-40')).toBe(false);
  });
});

describe('LexIds', () => {
  it('resolves missing dStrongs to the first entry with the same number', () => {
    const ids = new LexIds();
    ids.add({ eStrong: 'H0430', dStrong: 'H0430G' });
    ids.add({ eStrong: 'H0430', dStrong: 'H0430H' });
    ids.add({ eStrong: 'H1254a', dStrong: 'H1254A' });
    expect(ids.resolve('H0430H')).toBe('H0430H');
    expect(ids.resolve('H0430J')).toBe('H0430G');
    expect(ids.resolve('H1254')).toBe('H1254A');
    expect(ids.resolve('H9999')).toBeNull();
    expect([...ids.fallbacks]).toEqual([
      ['H0430J', 'H0430G'],
      ['H1254', 'H1254A'],
    ]);
    expect(ids.missing.get('H9999')).toBe(1);
  });
});
