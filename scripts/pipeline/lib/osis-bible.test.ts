import { describe, expect, it } from 'vitest';

import { appendSegs, finishRuns, morphCode, parseOsisVerse, segsToText, strongsFromLemma } from './osis-bible';

// Verbatim entries from the CrossWire KJV 3.1 and ASV 2.0 modules.
const GEN_1_1 =
  '<w lemma="strong:H07225">In the beginning</w> <w lemma="strong:H0430">God</w> <w lemma="strong:H0853 strong:H01254" morph="strongMorph:TH8804">created</w> <w lemma="strong:H08064">the heaven</w> <w lemma="strong:H0853">and</w> <w lemma="strong:H0776">the earth</w>.';
const GEN_1_6 =
  '<milestone marker="¶" type="x-p"/><w lemma="strong:H0430">And God</w> <w lemma="strong:H0559" morph="strongMorph:TH8799">said</w>, <w lemma="strong:H07549">Let there be a firmament</w> <w lemma="strong:H08432">in the midst</w> <w lemma="strong:H04325">of the waters</w>, <w lemma="strong:H0914" morph="strongMorph:TH8688">and let it divide</w> <w lemma="strong:H04325">the waters</w> <w lemma="strong:H04325">from the waters</w>.<note type="study"><catchWord>firmament</catchWord>: Heb. <rdg type="x-literal">expansion</rdg></note>';
const JOHN_3_16 =
  '<q marker="" who="Jesus"><milestone marker="¶" type="x-p"/><w lemma="strong:G3588 lemma.TR:ο" morph="robinson:T-NSM" src="17"/><w lemma="strong:G3588 lemma.TR:τον" morph="robinson:T-ASM" src="12"/><w lemma="strong:G1063 lemma.TR:γαρ" morph="robinson:CONJ" src="2">For</w> <w lemma="strong:G3588 strong:G2316 lemma.TR:ο lemma.TR:θεος" morph="robinson:T-NSM robinson:N-NSM" src="4 5">God</w> <w lemma="strong:G3779 lemma.TR:ουτως" morph="robinson:ADV" src="1">so</w> <w lemma="strong:G25 lemma.TR:ηγαπησεν" morph="robinson:V-AAI-3S" src="3">loved</w> <w lemma="strong:G3588 strong:G2889 lemma.TR:τον lemma.TR:κοσμον" morph="robinson:T-ASM robinson:N-ASM" src="6 7">the world</w>, <w lemma="strong:G5620 lemma.TR:ωστε" morph="robinson:CONJ" src="8">that</w> <w lemma="strong:G1325 lemma.TR:εδωκεν" morph="robinson:V-AAI-3S" src="14">he gave</w> <w lemma="strong:G846 lemma.TR:αυτου" morph="robinson:P-GSM" src="11">his</w> <w lemma="strong:G3439 lemma.TR:μονογενη" morph="robinson:A-ASM" src="13">only begotten</w> <w lemma="strong:G3588 strong:G5207 lemma.TR:τον lemma.TR:υιον" morph="robinson:T-ASM robinson:N-ASM" src="9 10">Son</w>, <w lemma="strong:G2443 lemma.TR:ινα" morph="robinson:CONJ" src="15">that</w> <w lemma="strong:G3956 lemma.TR:πας" morph="robinson:A-NSM" src="16">whosoever</w> <w lemma="strong:G4100 lemma.TR:πιστευων" morph="robinson:V-PAP-NSM" src="18">believeth</w> <w lemma="strong:G1519 lemma.TR:εις" morph="robinson:PREP" src="19">in</w> <w lemma="strong:G846 lemma.TR:αυτον" morph="robinson:P-ASM" src="20">him</w> <w lemma="strong:G622 lemma.TR:αποληται" morph="robinson:V-2AMS-3S" src="22" type="x-split-1793">should</w> <w lemma="strong:G3361 lemma.TR:μη" morph="robinson:PRT-N" src="21">not</w> <w lemma="strong:G622 lemma.TR:αποληται" morph="robinson:V-2AMS-3S" src="22" type="x-split-1793">perish</w>, <w lemma="strong:G235 lemma.TR:αλλ" morph="robinson:CONJ" src="23">but</w> <w lemma="strong:G2192 lemma.TR:εχη" morph="robinson:V-PAS-3S" src="24">have</w> <w lemma="strong:G166 lemma.TR:αιωνιον" morph="robinson:A-ASF" src="26">everlasting</w> <w lemma="strong:G2222 lemma.TR:ζωην" morph="robinson:N-ASF" src="25">life</w>.</q>';
const MATT_3_15 =
  '<w lemma="strong:G1161 lemma.TR:δε" morph="robinson:CONJ" src="2">And</w> <w lemma="strong:G3588 strong:G2424 lemma.TR:ο lemma.TR:ιησους" morph="robinson:T-NSM robinson:N-NSM" src="3 4">Jesus</w> <w lemma="strong:G611 lemma.TR:αποκριθεις" morph="robinson:V-AOP-NSM" src="1">answering</w> <w lemma="strong:G3004 lemma.TR:ειπεν" morph="robinson:V-2AAI-3S" src="5">said</w> <w lemma="strong:G4314 lemma.TR:προς" morph="robinson:PREP" src="6">unto</w> <w lemma="strong:G846 lemma.TR:αυτον" morph="robinson:P-ASM" src="7">him</w>, <q marker="" who="Jesus"><w lemma="strong:G863 lemma.TR:αφες" morph="robinson:V-2AAM-2S" src="8">Suffer</w> <transChange type="added">it to be so</transChange> <w lemma="strong:G737 lemma.TR:αρτι" morph="robinson:ADV" src="9">now</w>: <w lemma="strong:G1063 lemma.TR:γαρ" morph="robinson:CONJ" src="11">for</w> <w lemma="strong:G3779 lemma.TR:ουτως" morph="robinson:ADV" src="10">thus</w> <w lemma="strong:G4241 strong:G1510 lemma.TR:πρεπον lemma.TR:εστιν" morph="robinson:V-PAP-NSN robinson:V-PAI-3S" src="12 13 ">it becometh</w> <w lemma="strong:G1473 lemma.TR:ημιν" morph="robinson:P-1DP" src="14">us</w> <w lemma="strong:G4137 lemma.TR:πληρωσαι" morph="robinson:V-AAN" src="15">to fulfil</w> <w lemma="strong:G3956 lemma.TR:πασαν" morph="robinson:A-ASF" src="16">all</w> <w lemma="strong:G1343 lemma.TR:δικαιοσυνην" morph="robinson:N-ASF" src="17">righteousness</w>.</q> <w lemma="strong:G5119 lemma.TR:τοτε" morph="robinson:ADV" src="18">Then</w> <w lemma="strong:G863 lemma.TR:αφιησιν" morph="robinson:V-PAI-3S" src="19">he suffered</w> <w lemma="strong:G846 lemma.TR:αυτον" morph="robinson:P-ASM" src="20">him</w>.';
const PS_23_1 =
  '<div type="x-milestone" subType="x-preverse" sID="pv20"/><title canonical="true" type="psalm"><w lemma="strong:H04210">A Psalm</w> <w lemma="strong:H01732">of David</w>.</title><div type="x-milestone" subType="x-preverse" eID="pv20"/><w lemma="strong:H03068">The <divineName>Lord</divineName></w> <transChange type="added">is</transChange> <w lemma="strong:H07462" morph="strongMorph:TH8802">my shepherd</w>; <w lemma="strong:H02637" morph="strongMorph:TH8799">I shall not want</w>.';
const PS_119_1 =
  '<div type="x-milestone" subType="x-preverse" sID="pv94"/><title canonical="true" type="acrostic"><foreign xml:lang="hbo">א ALEPH.</foreign></title> <div type="x-milestone" subType="x-preverse" eID="pv94"/><w lemma="strong:H0835">Blessed</w> <transChange type="added">are</transChange> <w lemma="strong:H08549">the undefiled</w> <w lemma="strong:H01870">in the way</w>, <w lemma="strong:H01980" morph="strongMorph:TH8802">who walk</w> <w lemma="strong:H08451">in the law</w> <w lemma="strong:H03068">of the <divineName>Lord</divineName></w>.<note type="study"><catchWord>undefiled</catchWord>: or, <rdg type="alternate">perfect</rdg>, or, <rdg type="alternate">sincere</rdg></note>';
const GEN_44_10 =
  '<w lemma="strong:H0559" morph="strongMorph:TH8799">And he said</w>, Now also <transChange type="added">let</transChange> it <transChange type="added">be</transChange> <w lemma="strong:H01697">according unto your words</w>: <w lemma="strong:H03651"/><w lemma="strong:H04672" morph="strongMorph:TH8735">he with whom it is found</w> <w lemma="strong:H05650">shall be my servant</w>; <w lemma="strong:H05355">and ye shall be blameless</w>.';
const ROM_16_27_END =
  '<w lemma="strong:G281 lemma.TR:αμην" morph="robinson:HEB" src="12">Amen</w>. <chapter chapterTitle="CHAPTER 16." eID="gen1772" osisID="Rom.16"/> <div osisID="Rom.c" type="colophon"><w lemma="strong:G1125 lemma.TR:εγραφη" morph="robinson:V-2API-3S" src="15">Written</w> <w lemma="strong:G4314 lemma.TR:προς" morph="robinson:PREP" src="13">to</w> <w lemma="strong:G4514 lemma.TR:ρωμαιους" morph="robinson:A-APM" src="14">the Romans</w>.</div> <div canonical="true" eID="gen1756" osisID="Rom" type="book"/>';
const ASV_NUM_21_18 =
  '<div type="x-milestone" subType="x-preverse" sID="pv643"/><l level="1" sID="gen967"/><div type="x-milestone" subType="x-preverse" eID="pv643"/><w lemma="strong:H5971">The</w> <w lemma="strong:H875">well</w>, which <w lemma="strong:H5971">the</w> <w lemma="strong:H8269">princes</w> digged,<l eID="gen967" level="1"/> <lg eID="gen965"/> <div sID="gen970" type="x-p"/><w lemma="strong:H8269">And</w> <w lemma="strong:H5971">from</w> <w lemma="strong:H5971">the</w> <w lemma="strong:H4057">wilderness</w><transChange type="added"><w lemma="strong:H5971">they</w> journeyed</transChange><w lemma="strong:H875">to</w> <w lemma="strong:H4980">Mattanah</w>; ';
const ASV_JOHN_3_16 =
  '<div type="x-milestone" subType="x-preverse" sID="pv8050"/><div sID="gen15598" type="x-p"/><div type="x-milestone" subType="x-preverse" eID="pv8050"/><w lemma="strong:G1063">For</w> <w lemma="strong:G2316">God</w> <w lemma="strong:G2443">so</w> <w lemma="strong:G25">loved</w> <w lemma="strong:G3956">the</w> <w lemma="strong:G2889">world</w>, <w lemma="strong:G2443">that</w> <w lemma="strong:G846">he</w> <w lemma="strong:G1325">gave</w> <w lemma="strong:G846">his</w> <w lemma="strong:G3439">only</w> <w lemma="strong:G3439">begotten</w> <w lemma="strong:G5207">Son</w>, <w lemma="strong:G2443">that</w> whosoever believeth <w lemma="strong:G1519">on</w> <w lemma="strong:G846">him</w> <w lemma="strong:G2443">should</w> <w lemma="strong:G3361">not</w> <w lemma="strong:G622">perish</w>, <w lemma="strong:G235">but</w> <w lemma="strong:G2192">have</w> <w lemma="strong:G166">eternal</w> <w lemma="strong:G2222">life</w>. ';
const ASV_PS_119_8 =
  '<div type="x-milestone" subType="x-preverse" sID="pv5057"/><l level="1" sID="gen9990"/><div type="x-milestone" subType="x-preverse" eID="pv5057"/>I will observe thy statutes:<l eID="gen9990" level="1"/> <l level="1" sID="gen9991"/>Oh forsake me not utterly.<l eID="gen9991" level="1"/> <l sID="gen9992" type="x-center"/>ב BETH. <l eID="gen9992" type="x-center"/>';
const ASV_MATT_17_21 =
  '<note placement="foot"><reference type="annotateRef">17:21 </reference>Many authorities, some ancient, insert v. 21. <rdg type="alternate">But this kind goeth not out save by prayer and fasting. </rdg>See Mrk 9:29.</note> <div eID="gen15107" type="x-p"/>';

describe('Strong’s and morphology tokens', () => {
  it('drops the extra leading zeros of OT numbers and keeps NT numbers', () => {
    expect(strongsFromLemma('strong:H07225')).toBe('H7225');
    expect(strongsFromLemma('strong:H0430')).toBe('H430');
    expect(strongsFromLemma('strong:H053')).toBe('H53');
    expect(strongsFromLemma('strong:G25')).toBe('G25');
    expect(strongsFromLemma('lemma.TR:θεος')).toBeNull();
  });

  it('keeps morphology codes as given, without the scheme prefix', () => {
    expect(morphCode('strongMorph:TH8804')).toBe('TH8804');
    expect(morphCode('robinson:V-AAI-3S')).toBe('V-AAI-3S');
  });
});

describe('parseOsisVerse (KJV)', () => {
  it('converts Gen 1:1 with Strong’s numbers in module order', () => {
    const r = parseOsisVerse(GEN_1_1, { strongs: true });
    expect(segsToText(r.segs)).toBe('In the beginning God created the heaven and the earth.');
    expect(r.segs).toEqual([
      { t: 'In the beginning', s: ['H7225'] },
      ' ',
      { t: 'God', s: ['H430'] },
      ' ',
      { t: 'created', s: ['H853', 'H1254'], m: ['TH8804'] },
      ' ',
      { t: 'the heaven', s: ['H8064'] },
      ' ',
      { t: 'and', s: ['H853'] },
      ' ',
      { t: 'the earth', s: ['H776'] },
      '.',
    ]);
    expect(r.para).toBe(false);
  });

  it('marks John 3:16 red letter throughout, with a paragraph and no empty words', () => {
    const r = parseOsisVerse(JOHN_3_16, { strongs: true });
    expect(segsToText(r.segs)).toBe(
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
    );
    expect(r.para).toBe(true);
    expect(r.stats.quotes).toBe(1);
    expect(r.stats.emptyWords).toBe(2);
    expect(r.segs[0]).toEqual({ t: 'For', s: ['G1063'], m: ['CONJ'], w: 1 });
    expect(r.segs).toContainEqual({ t: 'God', s: ['G3588', 'G2316'], m: ['T-NSM', 'N-NSM'], w: 1 });
    expect(r.segs).toContainEqual({ t: 'loved', s: ['G25'], m: ['V-AAI-3S'], w: 1 });
    // Punctuation inside the quote is red; spaces between red words are plain strings.
    expect(r.segs).toContainEqual({ t: ', ', w: 1 });
    expect(r.segs[r.segs.length - 1]).toEqual({ t: '.', w: 1 });
    expect(r.segs.every((s) => (typeof s === 'string' ? s === ' ' : s.w === 1))).toBe(true);
  });

  it('handles a quote starting mid-verse and italic words inside it', () => {
    const r = parseOsisVerse(MATT_3_15, { strongs: true });
    expect(segsToText(r.segs)).toBe(
      'And Jesus answering said unto him, Suffer it to be so now: for thus it becometh us to fulfil all righteousness. Then he suffered him.',
    );
    expect(r.segs).toContainEqual({ t: 'it to be so', w: 1, a: 1 });
    expect(r.segs).toContainEqual({ t: ': ', w: 1 });
    expect(r.segs[0]).toEqual({ t: 'And', s: ['G1161'], m: ['CONJ'] });
    expect(r.segs[r.segs.length - 1]).toBe('.');
  });

  it('drops notes and reads the ¶ milestone', () => {
    const r = parseOsisVerse(GEN_1_6, { strongs: true });
    expect(segsToText(r.segs)).toBe('And God said, Let there be a firmament in the midst of the waters, and let it divide the waters from the waters.');
    expect(r.para).toBe(true);
    expect(r.stats.notes).toBe(1);
  });

  it('moves the Psalm title out of the verse and flags the divine name', () => {
    const r = parseOsisVerse(PS_23_1, { strongs: true });
    expect(r.titleType).toBe('psalm');
    expect(r.title).toEqual([{ t: 'A Psalm', s: ['H4210'] }, ' ', { t: 'of David', s: ['H1732'] }, '.']);
    expect(r.segs.slice(0, 4)).toEqual([{ t: 'The ', s: ['H3068'] }, { t: 'Lord', s: ['H3068'], dn: 1 }, ' ', { t: 'is', a: 1 }]);
    expect(segsToText(r.segs)).toBe('The Lord is my shepherd; I shall not want.');
    expect(segsToText(r.segs, true)).toBe('The LORD is my shepherd; I shall not want.');
  });

  it('reads the Ps 119 acrostic heading as a title', () => {
    const r = parseOsisVerse(PS_119_1, { strongs: true });
    expect(r.titleType).toBe('acrostic');
    expect(r.title).toEqual(['א ALEPH.']);
    expect(segsToText(r.segs)).toBe('Blessed are the undefiled in the way, who walk in the law of the Lord.');
  });

  it('drops untranslated words and keeps plain text between words', () => {
    const r = parseOsisVerse(GEN_44_10, { strongs: true });
    expect(segsToText(r.segs)).toBe(
      'And he said, Now also let it be according unto your words: he with whom it is found shall be my servant; and ye shall be blameless.',
    );
    expect(r.segs[1]).toBe(', Now also ');
    expect(r.stats.emptyWords).toBe(1);
  });

  it('drops colophons and structural milestones at the end of a book', () => {
    const r = parseOsisVerse(ROM_16_27_END, { strongs: true });
    expect(segsToText(r.segs)).toBe('Amen.');
    expect(r.stats.colophons).toEqual(['Written to the Romans.']);
  });
});

describe('parseOsisVerse (ASV)', () => {
  it('restores spaces missing at <transChange> boundaries and ignores Strong’s', () => {
    const r = parseOsisVerse(ASV_NUM_21_18);
    expect(segsToText(r.segs)).toBe('The well, which the princes digged, And from the wilderness they journeyed to Mattanah;');
    expect(r.stats.joinFixes).toBe(2);
    expect(r.stats.midParagraphs).toBe(1);
    expect(r.segs.every((s) => typeof s === 'string' || !s.s)).toBe(true);
  });

  it('reads <div type="x-p"> paragraph starts', () => {
    const r = parseOsisVerse(ASV_JOHN_3_16);
    expect(r.para).toBe(true);
    expect(r.segs).toEqual([
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth on him should not perish, but have eternal life.',
    ]);
  });

  it('keeps the next section’s centred heading out of the verse', () => {
    const r = parseOsisVerse(ASV_PS_119_8);
    expect(segsToText(r.segs)).toBe('I will observe thy statutes: Oh forsake me not utterly.');
    expect(r.titleType).toBe('acrostic');
    expect(r.title).toEqual(['ב BETH.']);
  });

  it('leaves a verse that exists only as a footnote empty', () => {
    expect(parseOsisVerse(ASV_MATT_17_21).segs).toEqual([]);
  });
});

describe('finishRuns', () => {
  it('collapses whitespace, merges plain text, and removes spaces before punctuation', () => {
    expect(finishRuns([{ t: '  a ' }, { t: ' b', s: ['G1'] }, { t: ' ' }, { t: ' , c ' }, { t: 'd  ' }])).toEqual([
      'a ',
      { t: 'b', s: ['G1'] },
      ', c d',
    ]);
  });

  it('turns whitespace-only runs into plain strings and merges same-flag runs', () => {
    expect(finishRuns([{ t: 'Verily', w: 1 }, { t: ' ', w: 1 }, { t: 'I say', w: 1 }, { t: ',', w: 1 }, { t: ' ' }])).toEqual([
      { t: 'Verily', w: 1 },
      ' ',
      { t: 'I say,', w: 1 },
    ]);
  });

  it('appends a title to verse text with one space', () => {
    expect(appendSegs(['And will make me to walk upon my high places.'], ['For the Chief Musician.'])).toEqual([
      'And will make me to walk upon my high places. For the Chief Musician.',
    ]);
  });
});
