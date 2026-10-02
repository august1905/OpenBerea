import { describe, expect, it } from 'vitest';

import {
  balanceParens,
  greekEntry,
  hebrewEntry,
  hebrewInlines,
  inlineText,
  parseCrossWireGreek,
  parseHebrewBeta,
  parseHebrewMain,
  parseMorphgntXml,
  plainTranslit,
  shortGloss,
  splitStrongsText,
  UNUSED_NOTE,
} from './dict-strongs';
import { RefLinker } from './dict-refs';

// Verbatim records from morphgnt strongsgreek.xml v1.9 and the CrossWire modules.
const XML = `<entries><entry strongs="00025">
 <strongs>25</strongs>   <greek BETA="A)GAPA/W" unicode="ἀγαπάω" translit="agapáō"/>   <pronunciation strongs="ag-ap-ah'-o"/>

 <strongs_derivation>perhaps from <greek BETA="A)/GAN" unicode="ἄγαν" translit="ágan"/> (much) [or compare <strongsref language="HEBREW" strongs="5689"/>];</strongs_derivation><strongs_def> to love (in a social or
 moral sense)</strongs_def><kjv_def>:--(be-)love(-ed).</kjv_def> Compare <strongsref language="GREEK" strongs="5368"/>.



</entry><entry strongs="00026">
 <strongs>26</strongs>   <greek BETA="A)GA/PH" unicode="ἀγάπη" translit="agápē"/>   <pronunciation strongs="ag-ah'-pay"/>

 <strongs_derivation>from <strongsref language="GREEK" strongs="25"/>;</strongs_derivation><strongs_def> love, i.e. affection or benevolence; specially (plural) a
 love-feast</strongs_def><kjv_def>:--(feast of) charity(-ably), dear, love.</kjv_def>

</entry><entry strongs="02309">
 <strongs>2309</strongs>   <greek BETA="QE/LW" unicode="θέλω" translit="thélō"/>   <pronunciation strongs="thel'-o"/>
  or <greek BETA="E)QE/LW" unicode="ἐθέλω" translit="ethélō"/>  <pronunciation strongs="eth-el'-o"/>,    in certain tenses
      <greek BETA="QELE/W" unicode="θελέω" translit="theléō"/>  <pronunciation strongs="thel-eh'-o"/>, which are otherwise obsolete

 <strongs_derivation>apparently strengthened from the alternate form of <strongsref language="GREEK" strongs="138"/>;</strongs_derivation><strongs_def> to determine</strongs_def><kjv_def>:--desire, will.</kjv_def>
</entry><entry strongs="02717">
 <strongs>2717</strongs>  Not Used
</entry></entries>`;

const H430_MAIN = " 430  'elohiym  el-o-heem'\r\n\r\n plural of 433; gods in the ordinary sense; but specifically\r\n used (in the plural thus, especially with the article) of the\r\n supreme God; occasionally applied by way of deference to\r\n magistrates; and sometimes as a superlative:--angels, X\r\n exceeding, God (gods)(-dess, -ly), X (very) great, judges, X\r\n mighty.\r\n see HEBREW for 0433\r";
const H430_BETA = '<entryFree n="430">\n\t\t<orth>אלהים</orth><lb/>\n\t\t<orth rend="bold" type="trans">\'ĕlôhîym</orth>\n\t\t<pron rend="italic">el-o-heem\'</pron><lb/>\n\t\t<def>Plural of <ref target="StrongsHebrew:433">H433</ref>; <hi rend="italic">gods</hi> in the ordinary sense</def>\n\t</entryFree>';
const H26_MAIN = " 26  'Abiygayil  ab-ee-gah'-yil\r\n\r\n or shorter Abiygal {ab-ee-gal'}; from 1 and 1524; father\r\n (i.e. source) of joy; Abigail or Abigal, the name of two\r\n Israelitesses:--Abigal.\r\n see HEBREW for 01\r\n see HEBREW for 01524\r";
const H26_BETA = '<entryFree n="26">\n\t\t<orth>אביגל  אביגיל</orth><lb/>\n\t\t<orth rend="bold" type="trans">\'ăbîygayil  \'ăbîygal</orth>\n\t\t<pron rend="italic">{ab-ee-gah\'yil} ab-ee-gal\'</pron><lb/>\n\t\t<def>From …</def>\n\t</entryFree>';
const H32_MAIN = " 32  'Abiyhayil  ab-ee-hah'-yil\r\n\r\n or (more correctly) hAbiychayil {ab-ee- khah'-yil}; from 1\r\n and 2428; father (i.e. possessor) of might; Abihail or\r\n Abichail, the name of three Israelites and two\r\n Israelitesses:--Abihail.\r\n see HEBREW for 02428\r";
const G25_TEI = '<entryFree n="25">\n<orth>ἀγαπάω</orth><lb/>\n<orth type="writing">ajgapavw</orth> <orth rend="bold" type="trans">agapao</orth> <pron rend="italic">{ag-ap-ah\'-o}</pron>\n<def>\n\n perhaps from agan (much) (or compare 5689); to love (in a social or\n moral sense):--(be-)love(-ed). Compare 5368.\n<lb/> see GREEK for 5689\n<lb/> see GREEK for 5368\n</def>\n\n</entryFree>';

const greek = parseMorphgntXml(XML);

describe('Greek (morphgnt XML)', () => {
  it('converts G25 with Hebrew and Greek cross-references', () => {
    const { entry, gloss } = greekEntry(greek.get(25)!);
    expect(entry).toMatchObject({ id: 'G25', lemma: 'ἀγαπάω', x: 'agapaō', pron: "ag-ap-ah'-o", kjv: '(be-)love(-ed)', roots: ['H5689'] });
    expect(entry.deriv).toEqual(['perhaps from ', { t: 'ἄγαν', l: 'grc' }, ' (much) [or compare ', { t: 'H5689', s: 'H5689' }, ']']);
    expect(entry.def).toEqual([
      { k: 'p', c: ['to love (in a social or moral sense)'] },
      { k: 'p', c: ['Compare ', { t: 'G5368', s: 'G5368' }, '.'] },
    ]);
    expect(gloss).toBe('to love (in a social or moral sense)');
  });
  it('converts G26 (from G25)', () => {
    const { entry, gloss } = greekEntry(greek.get(26)!);
    expect(entry.deriv).toEqual(['from ', { t: 'G25', s: 'G25' }]);
    expect(entry.roots).toEqual(['G25']);
    expect(entry.kjv).toBe('(feast of) charity(-ably), dear, love');
    expect(gloss).toBe('love, i.e. affection or benevolence');
  });
  it('keeps alternate forms as a note before the definition', () => {
    const { entry } = greekEntry(greek.get(2309)!);
    expect(inlineText(entry.def[0].c)).toBe("or ἐθέλω (ethelō, eth-el'-o), in certain tenses θελέω (theleō, thel-eh'-o), which are otherwise obsolete");
    expect(inlineText(entry.def[1].c)).toBe('to determine');
  });
  it('writes unused numbers as stubs', () => {
    expect(greekEntry(greek.get(2717)!)).toEqual({ entry: { id: 'G2717', lemma: '', x: '', def: [{ k: 'p', c: [UNUSED_NOTE] }] }, gloss: '(not used)' });
  });
  it('reads the CrossWire StrongsGreek v2.0 entry for cross-checks', () => {
    expect(parseCrossWireGreek(G25_TEI)).toEqual({ lemma: 'ἀγαπάω', x: 'agapao', pron: "ag-ap-ah'-o", kjv: '(be-)love(-ed)' });
  });
  it('strips accents but keeps macrons', () => {
    expect(plainTranslit('agápē')).toBe('agapē');
  });
});

describe('Hebrew (StrongsHebrew v1.2 + v3.0)', () => {
  it('converts H430', () => {
    const main = parseHebrewMain(H430_MAIN)!;
    expect(main).toMatchObject({ n: 430, translit: "'elohiym", pron: "el-o-heem'", refs: ['H433'] });
    const { entry, gloss } = hebrewEntry(main, parseHebrewBeta(H430_BETA));
    expect(entry).toMatchObject({ id: 'H430', lemma: 'אלהים', x: "'ĕlôhîym", pron: "el-o-heem'", roots: ['H433'] });
    expect(entry.deriv).toEqual(['plural of ', { t: 'H433', s: 'H433' }]);
    expect(entry.kjv).toBe('angels, X exceeding, God (gods)(-dess, -ly), X (very) great, judges, X mighty');
    expect(inlineText(entry.def[0].c)).toMatch(/^gods in the ordinary sense; but specifically used .* as a superlative$/);
    expect(gloss).toBe('gods in the ordinary sense');
  });
  it('re-orders the v3.0 forms to match their transliterations (H26)', () => {
    const beta = parseHebrewBeta(H26_BETA);
    expect(beta.forms).toEqual(['אביגיל', 'אביגל']);
    expect(beta.x).toEqual(["'ăbîygayil", "'ăbîygal"]);
    const { entry } = hebrewEntry(parseHebrewMain(H26_MAIN)!, beta);
    expect(entry.lemma).toBe('אביגיל');
    expect(entry.def[0].c).toEqual(['Also written ', { t: 'אביגל', l: 'hbo' }, " ('ăbîygal)"]);
    expect(entry.deriv).toEqual(['from ', { t: 'H1', s: 'H1' }, ' and ', { t: 'H1524', s: 'H1524' }]);
  });
  it('links numbers the "see HEBREW" lines miss (H32 "from 1")', () => {
    const { entry } = hebrewEntry(parseHebrewMain(H32_MAIN)!, null);
    expect(entry.roots).toEqual(['H1', 'H2428']);
    expect(inlineText(entry.def[0].c)).toBe("or (more correctly) hAbiychayil (ab-ee- khah'-yil)");
  });
  it('splits the forms clause, derivation, definition and KJV usage', () => {
    expect(splitStrongsText("or shorter Abiygal {ab-ee-gal'}; from 1 and 1524; father (i.e. source) of joy:--Abigal. Compare 1.", ['H1', 'H1524'])).toEqual({
      forms: "or shorter Abiygal {ab-ee-gal'}",
      deriv: 'from 1 and 1524',
      def: 'father (i.e. source) of joy',
      kjv: 'Abigal',
      tail: 'Compare 1.',
    });
    expect(splitStrongsText('a clerical error for 130; an Edomite (as in the margin}:--Syrian.', ['H130'])).toMatchObject({ deriv: 'a clerical error for 130', def: 'an Edomite (as in the margin)', kjv: 'Syrian' });
  });
  it('links Scripture refs and leaves book numbers alone', () => {
    const c = hebrewInlines('by defect. transcription (2 Sam. 23:20) Iysh-Chay; as if from 376 and 2416', ['H376', 'H2416'], new RefLinker('', false));
    expect(c).toEqual(['by defect. transcription (', { t: '2 Sam. 23:20', ref: '2SA.23.20' }, ') Iysh-Chay; as if from ', { t: 'H376', s: 'H376' }, ' and ', { t: 'H2416', s: 'H2416' }]);
  });
  it('drops closing brackets without an opening one', () => {
    expect(balanceParens('remote application):--chief')).toBe('remote application:--chief');
  });
});

describe('shortGloss', () => {
  it('takes the first sense, under 60 characters', () => {
    expect(shortGloss('father, in a literal and immediate, or figurative and remote application')).toBe('father');
    expect(shortGloss('properly, to flow as water (i.e. to rain); transitively, to lay or throw (especially an arrow, i.e. to shoot)')).toBe('to flow as water (i.e. to rain)');
    expect(shortGloss('', 'angel, bull, chiefest')).toBe('angel');
    expect(shortGloss('a b c d e f g h i j k l m n o p q r s t u v w x y z a b c d e f g h i j').length).toBeLessThan(60);
  });
});
