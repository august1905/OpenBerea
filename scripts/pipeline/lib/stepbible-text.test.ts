import { describe, expect, it } from 'vitest';

import { splitMorph } from '../../../src/lib/data/morph';
import {
  BookAccumulator,
  cleanGreekGloss,
  hebrewSurface,
  inAllEditions,
  parseMeaningVariants,
  parseTagntRow,
  parseTahotRow,
  splitGreek,
  splitGreekTags,
  stripHebrewPunct,
  tagntName,
  tagntVariants,
  tagntWord,
  tahotName,
  tahotWord,
  wordStrongs,
} from './stepbible-text';

// Rows copied from the STEPBible files at commit b99716b (trailing empty fields trimmed).
const row = (...f: string[]) => f.join('\t');
const TAHOT = {
  gen1_1_01: row('Gen.1.1#01=L', 'בְּ/רֵאשִׁ֖ית', 'be./re.Shit', 'in/ beginning', 'H9003/{H7225G}', 'HR/Ncfsa', '', '', 'H7225G', '', '', 'H9003=ב=in/{H7225G=רֵאשִׁית=: beginning»first:1_beginning}'),
  gen1_1_03: row('Gen.1.1#03=L', 'אֱלֹהִ֑ים', "'E.lo.Him", 'God', '{H0430G}', 'HNcmpa', '', '', 'H0430G', '', '', '{H0430G=אֱלֹהִים=God»LORD@Gen.1.1-Heb}'),
  gen1_1_07: row('Gen.1.1#07=L', 'הָ/אָֽרֶץ\\׃', "ha./'A.retz", 'the/ earth', 'H9009/{H0776G}\\H9016', 'HTd/Ncfsa', '', '', 'H0776G', '', '', 'H9009=ה=the/{H0776G=אֶ֫רֶץ=: country;_planet»land:2_country;_planet}\\H9016=׃=verseEnd'),
  gen1_5_02: row('Gen.1.5#02=L', 'אֱלֹהִ֤ים\\׀', "'E.lo.Him", 'God', '{H0430G}\\H9015', 'HNcmpa', '', '', 'H0430G', '', '', '{H0430G=אֱלֹהִים=God»LORD@Gen.1.1-Heb}\\H9015=׀=separate'),
  gen1_11_16: row('Gen.1.11#16=L', 'ב֖/וֹ', 'v/o', '[is] in <the>/ it', 'H9003/{H9033}', 'HRd/Sp3ms', '', '', 'H9033', '', '', 'H9003=ב=in/{H9033=Os3m=him}'),
  gen9_21_07: row('Gen.9.21#07=Q(K)', 'אָהֳלֽ/וֹ\\׃', "'o.ho.L/o", 'tent/ his', '{H0168G}/H9023\\H9016', 'HNcmsc/Sp3ms', 'K= \'o.ho.Lo/h (אָהֳלֹ/ה\\׃) "tent/ his" (H0168G/H9023\\H9016=HNcbsc/Sp3ms)', 'L= אָהֳלֹֽ/ה\\׃ ¦ ;', 'H0168G', '', '', '{H0168G=אֹ֫הֶל=: tent»tent:1_tent}/H9023=Ps3m=his\\H9016=׃=verseEnd'),
  gen14_17_09: row('Gen.14.17#09=LBH(A)', 'כְּדָרְ\\־לָעֹ֔מֶר', "Kedor-la.'ֹo.mer", 'Kedor-laomer', '{H3540}\\H9014', 'HNpm', '', '', 'H3540_A', '', '', '{H3540=כְּדׇרְלָעֹמֶר=Chedorlaomer»Chedorlaomer@Gen.14.1-}\\H9014=־=link'),
  gen30_11_03: row('Gen.30.11#03=Q(K)', 'בָּ֣א//גָ֑ד', 'be.//gad', 'it has come//good fortune', '{H0935G}//{H1409}', 'HVqp3ms//Ncmsa', '', '', 'H0935G, H1409', '', '', '{H0935G=בּוֹא=: come»to come (in):1_come;_go_in}//{H1409=גָּד=fortune}'),
  exo4_2_04: row('Exo.4.2#04=Q(K)', 'מַה/־/זֶּ֣ה', 'mah/-/zeh-', 'what/ /[is] this?', '{H4100}/H9014/{H2088}', 'HPi//Tm', '', '', 'H4100, H2088', '', '', '{H4100=מָה=what?}/H9014=־=link/{H2088=זֶה=this}'),
  num7_59_17: row('Num.7.59#17=L(AH+B)', 'פְּדָה/ /צֽוּר\\׃\\ \\פ', 'pe.dah/ /tzur', 'Pedah/ /zur', '{H6301}+/ /{H6301}\\H9016\\ \\H9017', 'HNpm//Npm', '', '', 'H6301', '', '', '{H6301=פְּדָהצוּר=Pedahzur»Pedahzur@Num.1.10-}+/ /{H6301=פְּדָהצוּר=Pedahzur»Pedahzur@Num.1.10-}\\H9016=׃=verseEnd\\ \\H9017=פ=para'),
  isa44_24_16: row('Isa.44.24#16=Q(K)', '', '[ ]', '[ ]', '', '', 'K= mi (מִי) "who [was]?" (H4310=HPi)', 'L= מֵי ¦ ;', '', 'H4310, H4325G'),
  mal4_1_01: row('Mal.4.1(3.19)#01=L', 'כִּֽי\\־', 'ki-', 'for', '{H3588A}\\H9014', 'HTc', '', '', 'H3588A', '', '', '{H3588A=כִּי=for}\\H9014=־=link'),
  psa51_0_01: row('Psa.51.0(51.1)#01=L', 'לַ/מְנַצֵּ֗חַ', 'la/m.na.Tze.ach', 'to the/ choirmaster', 'H9005/{H5329}', 'HRd/Vprmsa', '', '', 'H5329', '', '', 'H9005=ל=to/{H5329=נָצַח=to conduct}'),
};

const TAGNT = {
  jhn3_16_03: row('Jhn.3.16#03=NKO', 'ἠγάπησεν (ēgapēsen)', 'loved', 'G0025=V-AAI-3S', 'ἀγαπάω=to love', 'NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz', '', '', 'amó', 'to love', '#03', 'G0025'),
  jhn3_16_11: row('Jhn.3.16#11=ko', 'αὐτοῦ (autou)', 'of him', 'G0846=P-GSM', 'αὐτός=he/she/it/self', 'Treg+TR+Byz', '', '', 'de él', 'of him', '#11«10:G5207', 'G0846_a', 'G3778'),
  act1_5_16: row('Act.1.5#16=NKO', 'ἡμέρας.¶ (hēmeras)', 'days.', 'G2250=N-APF', 'ἡμέρα=day', 'NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz', '', '', 'días', 'days', '#16', 'G2250'),
  act4_5_16: row('Act.4.5[4.6]#16=N(k)O', 'ἐν (en)', '[6] in', 'G1722=PREP', 'ἐν=in/on/among', 'NA28+NA27+Tyn+SBL+WH+Treg', 'εἰς (t=eis) into - G1519=PREP in: TR+Byz', '', 'en', 'in', '#16', 'G1722', 'G1519'),
  act12_6_04: row('Act.12.6#04=N(k)(o)', 'προαγαγεῖν (proagagein)', 'to bring forth', 'G4254=V-2AAN', 'προάγω=to go/bring before', 'NA28+NA27+SBL', 'προάγειν (t=proagein) to bring forth - G4254=V-PAN in: Treg+TR+Byz ¦ προσαγαγεῖν (o=prosagagein) to bring forward - G4317=V-2AAN in: Tyn+WH', '', 'conducir hacia', 'to bring before', '#04', 'G4254', 'G4317'),
  act22_13_11: row('Act.22.13#11=NKO', 'κἀγὼ (kagō)', 'And I myself', 'G1473=P-1NS + G2532=CONJ', 'κἀγώ=and I', 'NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz', '', '', 'yo también', 'and I', '#11»15:G0308', 'G2532_B, G1473_B', 'G2504'),
  rom16_25_01: row('Rom.16.25{14.24}#01=NKO', 'Τῷ (Tō)', '{14.24} To Him', 'G3588=T-DSM', 'ὁ=the/this/who', 'NA28+NA27+Tyn+WH+Treg+TR+Byz«14.24', '', '', 'A el', '[that] which', '#01»03:G1410', 'G3588_A'),
  mat1_10_10: row('Mat.1.10#10=N(k)O', 'Ἀμώς· (Amōs)', 'Amos;', 'G0301H=N-ASM-P', 'Ἀμώς=Amos', 'NA28+NA27+Tyn+SBL+WH+Treg', 'Ἀμών (t=Amōn) Amon - G0300=N-ASM-P in: TR+Byz', '', 'Amós', 'Amos»Amos|Amon@2Ki.21.18', '#10', 'G0301_A', 'G0300'),
  mat17_15_01: row('Mat.17.15[17.14]#01=NKO', 'καὶ (kai)', 'and', 'G2532=CONJ', 'καί=and', 'NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz', '', '', 'Y', 'and', '#01', 'G2532_A'),
};

const ext = (d: string) => d; // every dStrong exists
const noNames = () => null;
const nfd = (s: string) => s.normalize('NFD');

function hebrew(line: string) {
  const r = parseTahotRow(line);
  if (!r) throw new Error('row did not parse');
  return r;
}

describe('TAHOT rows', () => {
  it('parses refs, including Hebrew numbering in brackets', () => {
    const r = hebrew(TAHOT.mal4_1_01);
    expect([r.book, r.ch, r.vs, r.hch, r.hvs, r.wn, r.type]).toEqual(['MAL', 4, 1, 3, 19, '01', 'L']);
    const g = hebrew(TAHOT.gen1_1_01);
    expect([g.book, g.ch, g.vs, g.hch, g.hvs]).toEqual(['GEN', 1, 1, 1, 1]);
    expect(parseTahotRow('Eng (Heb) Ref & Type\tHebrew\tTransliteration')).toBeNull();
    expect(parseTahotRow('# Gen.1.1\tbe.re.Shit (בְּרֵאשִׁ֖ית)')).toBeNull();
  });

  it('builds a word with prefix morphemes (Gen 1:1 #01)', () => {
    const w = tahotWord(hebrew(TAHOT.gen1_1_01), ext, noNames)!;
    expect(nfd(w.t)).toBe(nfd('בְּרֵאשִׁ֖ית'));
    expect(w).toMatchObject({ x: 'be.re.Shit', g: 'in beginning', s: 'H7225', e: 'H7225G', m: 'HR/Ncfsa' });
    expect(w.p?.map((p) => [p.s, p.m, p.g])).toEqual([
      ['H9003', 'HR', 'in'],
      ['H7225', 'HNcfsa', 'beginning'],
    ]);
    // Morpheme codes line up with splitMorph() of the word's code.
    expect(w.p?.map((p) => p.m)).toEqual(splitMorph(w.m, 'hbo'));
  });

  it('keeps sof pasuq on the surface but not on the morpheme or the tag (Gen 1:1 #07)', () => {
    const w = tahotWord(hebrew(TAHOT.gen1_1_07), ext, noNames)!;
    expect(nfd(w.t)).toBe(nfd('הָאָֽרֶץ׃'));
    expect(nfd(w.p![1].t)).toBe(nfd('אָֽרֶץ'));
    expect(w.s).toBe('H776');
    expect(w.e).toBe('H0776G');
  });

  it('reads the proper-name id from the expanded tags', () => {
    expect(tahotName(hebrew(TAHOT.gen1_1_03).expanded)).toEqual({ raw: 'LORD@Gen.1.1-Heb', dStrong: 'H0430G' });
    expect(tahotName(hebrew(TAHOT.gen1_1_01).expanded)).toBeNull();
    const seen: [string, string[]][] = [];
    const w = tahotWord(hebrew(TAHOT.gen1_1_03), ext, (raw, d) => {
      seen.push([raw, d]);
      return 'LORD@Gen.1.1-Rev';
    })!;
    expect(w.pn).toBe('LORD@Gen.1.1-Rev');
    expect(seen[0]).toEqual(['LORD@Gen.1.1-Heb', ['H0430G', 'H0430G']]);
    expect(w.p).toBeUndefined();
  });

  it('puts paseq after a space and maqqef directly', () => {
    expect(nfd(tahotWord(hebrew(TAHOT.gen1_5_02), ext, noNames)!.t)).toBe(nfd('אֱלֹהִ֤ים ׀'));
    expect(nfd(tahotWord(hebrew(TAHOT.mal4_1_01), ext, noNames)!.t)).toBe(nfd('כִּֽי־'));
    expect(hebrewSurface('פְּדָה/ /צֽוּר\\׃\\ \\פ')).toBe('פְּדָה צֽוּר׃ פ');
  });

  it('handles Qere words with suffixes (Gen 9:21 #07)', () => {
    const w = tahotWord(hebrew(TAHOT.gen9_21_07), ext, noNames)!;
    expect(w.m).toBe('HNcmsc/Sp3ms');
    expect(w.p?.map((p) => [p.s, p.m, p.g])).toEqual([
      ['H168', 'HNcmsc', 'tent'],
      ['H9023', 'HSp3ms', 'his'],
    ]);
  });

  it('splits two joined words ("//") and maqqef joiners', () => {
    const gad = tahotWord(hebrew(TAHOT.gen30_11_03), ext, noNames)!;
    expect(nfd(gad.t)).toBe(nfd('בָּ֣א גָ֑ד'));
    expect(gad.x).toBe('be gad');
    expect(gad.p?.map((p) => [p.s, p.m])).toEqual([
      ['H935', 'HVqp3ms'],
      ['H1409', 'HNcmsa'],
    ]);
    const mah = tahotWord(hebrew(TAHOT.exo4_2_04), ext, noNames)!;
    expect(nfd(mah.t)).toBe(nfd('מַה־זֶּ֣ה'));
    expect(mah.p?.map((p) => p.s)).toEqual(['H4100', 'H2088']);
    expect(mah.g).toBe('what [is] this?');
    const stats = { misaligned: 0 };
    const pedah = tahotWord(hebrew(TAHOT.num7_59_17), ext, noNames, stats)!;
    expect(pedah.p?.map((p) => [p.s, p.m])).toEqual([
      ['H6301', 'HNpm'],
      ['H6301', 'HNpm'],
    ]);
    expect(stats.misaligned).toBe(0);
  });

  it('keeps a maqqef inside a one-word name (Kedorlaomer)', () => {
    expect(nfd(stripHebrewPunct('כְּדָרְ\\־לָעֹ֔מֶר'))).toBe(nfd('כְּדָרְ־לָעֹ֔מֶר'));
    expect(stripHebrewPunct('צֽוּר\\׃\\ \\פ')).toBe('צֽוּר');
    const w = tahotWord(hebrew(TAHOT.gen14_17_09), ext, noNames)!;
    expect(w.s).toBe('H3540');
    expect(w.p).toBeUndefined();
  });

  it('omits unread Ketiv rows (no Hebrew)', () => {
    expect(tahotWord(hebrew(TAHOT.isa44_24_16), ext, noNames)).toBeNull();
  });

  it('falls back through the extended-id resolver', () => {
    const w = tahotWord(hebrew(TAHOT.gen1_1_03), (d) => (d === 'H0430G' ? null : d), noNames)!;
    expect(w.e).toBeUndefined();
  });

  it('lists concordance Strong numbers without affixes', () => {
    expect(wordStrongs(tahotWord(hebrew(TAHOT.gen1_1_01), ext, noNames)!)).toEqual(['H7225']);
    expect(wordStrongs(tahotWord(hebrew(TAHOT.gen30_11_03), ext, noNames)!)).toEqual(['H935', 'H1409']);
    expect(wordStrongs(tahotWord(hebrew(TAHOT.gen1_11_16), ext, noNames)!)).toEqual([]);
  });
});

describe('TAGNT rows', () => {
  const greek = (line: string) => {
    const r = parseTagntRow(line);
    if (!r) throw new Error('row did not parse');
    return r;
  };

  it('uses the KJV alternate in [ ] and the NA alternate in ( ) only for numbering', () => {
    const r = greek(TAGNT.mat17_15_01);
    expect([r.ch, r.vs, r.kch, r.kvs, r.nch, r.nvs]).toEqual([17, 15, 17, 14, 17, 15]);
    const rom = greek(TAGNT.rom16_25_01);
    expect([rom.kch, rom.kvs]).toEqual([16, 25]);
  });

  it('builds John 3:16 words', () => {
    const loved = tagntWord(greek(TAGNT.jhn3_16_03), ext, noNames);
    expect(nfd(loved.t)).toBe(nfd('ἠγάπησεν'));
    expect(loved).toMatchObject({ x: 'ēgapēsen', g: 'loved', s: 'G25', e: 'G0025', m: 'V-AAI-3S' });
    expect(loved.ed).toBeUndefined();
    const autou = tagntWord(greek(TAGNT.jhn3_16_11), ext, noNames);
    expect(autou).toMatchObject({ s: 'G846', m: 'P-GSM', ed: 'Treg+TR+Byz' });
  });

  it('cleans text, glosses, editions and crasis codes', () => {
    expect(splitGreek('ἡμέρας.¶ (hēmeras)')).toEqual({ t: 'ἡμέρας.', x: 'hēmeras' });
    expect(cleanGreekGloss('[6] in')).toBe('in');
    expect(cleanGreekGloss('{14.24} To Him')).toBe('To Him');
    expect(cleanGreekGloss('(39) in')).toBe('in');
    expect(tagntWord(greek(TAGNT.act4_5_16), ext, noNames).g).toBe('in');
    const kago = tagntWord(greek(TAGNT.act22_13_11), ext, noNames);
    expect(kago).toMatchObject({ s: 'G1473', e: 'G1473', m: 'P-1NS + CONJ' });
    expect(splitMorph(kago.m, 'grc')).toEqual(['P-1NS', 'CONJ']);
    expect(splitGreekTags('G1199=N-DPM + G0846|G3165«G3450=P-1GS')).toEqual({ dStrongs: ['G1199', 'G3165'], m: 'N-DPM + P-1GS' });
    expect(inAllEditions('NA28+NA27+Tyn+SBL+WH+Treg+TR»1+Byz»1')).toBe(true);
    expect(tagntWord(greek(TAGNT.rom16_25_01), ext, noNames).ed).toBe('NA28+NA27+Tyn+WH+Treg+TR+Byz');
  });

  it('reads proper-name ids from the sub-meaning column', () => {
    expect(tagntName('Amos»Amos|Amon@2Ki.21.18')).toBe('Amos|Amon@2Ki.21.18');
    expect(tagntName('Pyrrhus|Pyrrhus@Act.20.4')).toBe('Pyrrhus|Pyrrhus@Act.20.4');
    expect(tagntName('to love')).toBeNull();
  });

  it('parses meaning variants', () => {
    expect(parseMeaningVariants(greek(TAGNT.act12_6_04).meaningVariants)).toEqual([
      { t: 'προάγειν', g: 'to bring forth', ed: 'Treg+TR+Byz', k: 'alt', s: 'G4254', m: 'V-PAN' },
      { t: 'προσαγαγεῖν', g: 'to bring forward', ed: 'Tyn+WH', k: 'alt', s: 'G4317', m: 'V-2AAN' },
    ]);
    expect(
      parseMeaningVariants('δεσμοῖς μου (T=desmois mou) my imprisonments - G1199=N-DPM + G0846|G3165«G3450=P-1GS in: TR+Byz'),
    ).toEqual([{ t: 'δεσμοῖς μου', g: 'my imprisonments', ed: 'TR+Byz', k: 'alt', s: 'G1199 + G3165', m: 'N-DPM + P-1GS' }]);
  });

  it('makes presence and alt units with the word index', () => {
    const r = greek(TAGNT.mat1_10_10);
    const w = tagntWord(r, ext, noNames);
    expect(tagntVariants(r, w, 9)).toEqual([
      { w: 9, t: 'Ἀμώς·', g: 'Amos;', ed: 'NA28+NA27+Tyn+SBL+WH+Treg', k: 'presence' },
      { w: 9, t: 'Ἀμών', g: 'Amon', ed: 'TR+Byz', k: 'alt', s: 'G300', m: 'N-ASM-P' },
    ]);
    const full = greek(TAGNT.jhn3_16_03);
    expect(tagntVariants(full, tagntWord(full, ext, noNames), 2)).toEqual([]);
  });
});

describe('BookAccumulator', () => {
  const w = (t: string) => ({ t, x: '', g: '', s: 'H1', m: 'HNcmsa' });

  it('groups by KJV verse and records differing source numbering', () => {
    const acc = new BookAccumulator('MAL', 'hbo');
    acc.add(3, 18, 3, 18, w('a'));
    acc.add(4, 1, 3, 19, w('b'));
    acc.add(4, 1, 3, 19, w('c'));
    const [c3, c4] = acc.toChapters();
    expect(c3.v[0]).toEqual({ n: 18, w: [w('a')] });
    expect(c4).toEqual({ b: 'MAL', c: 4, lang: 'hbo', v: [{ n: 1, w: [w('b'), w('c')], src: '3:19' }] });
  });

  it('formats verses built from two source verses and sorts verses', () => {
    const acc = new BookAccumulator('PSA', 'hbo');
    expect(acc.add(51, 1, 51, 3, w('x'))).toBe(0);
    acc.add(51, 0, 51, 1, w('a'));
    expect(acc.add(51, 0, 51, 2, w('b'))).toBe(1);
    const [ch] = acc.toChapters();
    expect(ch.v.map((v) => [v.n, v.src])).toEqual([
      [0, '51:1-2'],
      [1, '51:3'],
    ]);
    const nt = new BookAccumulator('REV', 'grc');
    nt.add(13, 1, 12, 18, w('a'));
    nt.add(13, 1, 13, 1, w('b'));
    expect(nt.toChapters()[0].v[0].src).toBe('12:18-13:1');
  });
});
