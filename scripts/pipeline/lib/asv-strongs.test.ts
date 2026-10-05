import { describe, expect, it } from 'vitest';

import type { Seg } from '../../../src/lib/data/types';
import { alignWords, isFunctionWord, lcsPairs, movedPhrases, normWord, similarWords, transferStrongs, verseWords, withoutStrongs } from './asv-strongs';

// KJV segments as converted from the CrossWire KJV module, and the ASV verses as converted
// (untagged) from the ASV module.
const KJV_GEN_1_1: Seg[] = [
  { t: 'In the beginning', s: ['H7225'] }, ' ', { t: 'God', s: ['H430'] }, ' ', { t: 'created', s: ['H853', 'H1254'], m: ['TH8804'] }, ' ',
  { t: 'the heaven', s: ['H8064'] }, ' ', { t: 'and', s: ['H853'] }, ' ', { t: 'the earth', s: ['H776'] }, '.',
];
const ASV_GEN_1_1: Seg[] = ['In the beginning God created the heavens and the earth.'];
const KJV_PS_23_1: Seg[] = [
  { t: 'The ', s: ['H3068'] }, { t: 'Lord', s: ['H3068'], dn: 1 }, ' ', { t: 'is', a: 1 }, ' ', { t: 'my shepherd', s: ['H7462'], m: ['TH8802'] }, '; ',
  { t: 'I shall not want', s: ['H2637'], m: ['TH8799'] }, '.',
];
const ASV_PS_23_1: Seg[] = ['Jehovah is my shepherd; I shall not want.'];
const KJV_ACTS_2_4_PART: Seg[] = [{ t: 'filled', s: ['G4130'] }, ' ', { t: 'with the', s: ['G4151'] }, ' ', { t: 'Holy', s: ['G40'] }, ' ', { t: 'Ghost', s: ['G4151'] }, ','];
const KJV_ROM_8_28: Seg[] = [
  { t: 'And', s: ['G1161'] }, ' ', { t: 'we know', s: ['G1492'] }, ' ', { t: 'that', s: ['G3754'] }, ' ', { t: 'all things', s: ['G3956'] }, ' ',
  { t: 'work together', s: ['G4903'] }, ' ', { t: 'for', s: ['G1519'] }, ' ', { t: 'good', s: ['G18'] }, ' ', { t: 'to them that love', s: ['G3588', 'G25'] }, ' ',
  { t: 'God', s: ['G3588', 'G2316'] }, ', ', { t: 'to them who are', s: ['G1510'] }, ' ', { t: 'the called', s: ['G3588', 'G2822'] }, ' ',
  { t: 'according to', s: ['G2596'] }, ' ', { t: 'his', a: 1 }, ' ', { t: 'purpose', s: ['G4286'] }, '.',
];
const ASV_ROM_8_28: Seg[] = [
  'And we know that to them that love God all things work together for good, ', { t: 'even', a: 1 }, ' to them that are called according to ', { t: 'his', a: 1 }, ' purpose.',
];

const tagOf = (segs: Seg[], text: string) => {
  const seg = segs.find((s) => typeof s !== 'string' && s.t === text);
  return typeof seg === 'string' ? undefined : seg;
};

describe('word normalization', () => {
  it('ignores case, apostrophes, hyphens and en dashes', () => {
    expect(normWord('Beth–el')).toBe('bethel');
    expect(normWord('Beth-el')).toBe('bethel');
    expect(normWord('king’s')).toBe('kings');
  });

  it('reads the KJV small-caps LORD and GOD as the ASV’s "Jehovah"', () => {
    expect(normWord('Lord', true)).toBe('jehovah');
    expect(normWord('Lord’s', true)).toBe('jehovahs');
    expect(normWord('GOD', true)).toBe('jehovah');
    expect(normWord('Lord')).toBe('lord');
  });

  it('groups "The " + small-caps "LORD" as one tagged element, and keeps italics', () => {
    const { words, units } = verseWords(KJV_PS_23_1);
    expect(words.map((w) => w.n)).toEqual(['the', 'jehovah', 'is', 'my', 'shepherd', 'i', 'shall', 'not', 'want']);
    expect(words[0].unit).toBe(words[1].unit);
    expect(units[words[0].unit]).toEqual({ s: ['H3068'] });
    expect(words[2]).toMatchObject({ unit: -1, a: true });
  });

  it('keeps the New Testament’s small-caps "Lord" as "lord"', () => {
    expect(verseWords([{ t: 'Lord', s: ['G3588', 'G2962'], dn: 1 }]).words[0].n).toBe('lord');
  });
});

describe('similarWords', () => {
  it.each([
    ['heaven', 'heavens'],
    ['honour', 'honor'],
    ['shewed', 'showed'],
    ['morter', 'mortar'],
    ['maachah', 'maacah'],
    ['ghost', 'spirit'],
    ['which', 'who'],
    ['tabernacle', 'tent'],
    ['judea', 'judæa'],
  ])('%s ~ %s', (k, a) => expect(similarWords(k, a)).toBe(true));

  it.each([
    ['the', 'then'],
    ['they', 'them'],
    ['and', 'but'],
    ['were', 'where'],
  ])('%s ≁ %s', (k, a) => expect(similarWords(k, a)).toBe(false));
});

describe('lcsPairs', () => {
  it('finds a longest common subsequence', () => {
    expect(lcsPairs([...'abcbdab'], [...'bdcaba'], (x, y) => x === y)).toHaveLength(4);
  });

  it('prefers unbroken runs among equally long alignments', () => {
    // "the" pairs with the "the" of "the heaven", not the earlier one.
    const k = ['the', 'earth', 'and', 'the', 'heaven'];
    const a = ['the', 'heaven'];
    expect(lcsPairs(k, a, (x, y) => x === y)).toEqual([
      [3, 0],
      [4, 1],
    ]);
  });
});

describe('alignWords', () => {
  const align = (kjv: Seg[], asv: Seg[]) => {
    const k = verseWords(kjv).words;
    const a = verseWords(asv).words;
    return alignWords(k, a).map((m, j) => `${a[j].t}:${m ? `${m.rule}:${k[m.k].t}` : '-'}`);
  };

  it('matches identical words, respellings, and one-for-one swaps', () => {
    expect(align(KJV_GEN_1_1, ASV_GEN_1_1)).toEqual([
      'In:same:In', 'the:same:the', 'beginning:same:beginning', 'God:same:God', 'created:same:created',
      'the:same:the', 'heavens:similar:heaven', 'and:same:and', 'the:same:the', 'earth:same:earth',
    ]);
    expect(align(['A tabernacle of the congregation'], ['A tent of meeting'])).toEqual(['A:same:A', 'tent:similar:tabernacle', 'of:same:of', 'meeting:-']);
    expect(align([{ t: 'every thing', s: ['H1'] }, ' that creepeth'], ['everything that creepeth'])[0]).toBe('everything:similar:every');
    // A respelling splits the gap, and what is left is a one-for-one swap.
    expect(align(['and he did burn it'], ['and he was burning it'])).toEqual(['and:same:and', 'he:same:he', 'was:position:did', 'burning:similar:burn', 'it:same:it']);
  });

  it('leaves words the ASV adds or rewords unmatched', () => {
    expect(align(['he went up'], ['he went up a second time'])).toEqual(['he:same:he', 'went:same:went', 'up:same:up', 'a:-', 'second:-', 'time:-']);
    // Two words against one, with no respelling between them, stay unmatched (Exod 27:17).
    expect(align(['All the pillars round about the court'], ['All the pillars of the court'])).toEqual(['All:same:All', 'the:same:the', 'pillars:same:pillars', 'of:-', 'the:same:the', 'court:same:court']);
  });

  it('swaps one word for one only when both are content words or both function words', () => {
    expect(align(['twelve wells of water'], ['twelve springs of water'])[1]).toBe('springs:position:wells'); // Exod 15:27
    expect(align(['the fathers upon the children unto the third'], ['the fathers upon the children upon the third'])[5]).toBe('upon:position:unto'); // Exod 20:5
    // Function word for content word, or the reverse: the ASV reworded the phrase (Isa 56:6, Prov 2:19).
    expect(align(['and taketh hold of my covenant'], ['and holdeth fast my covenant'])).toEqual(['and:same:and', 'holdeth:similar:hold', 'fast:-', 'my:same:my', 'covenant:same:covenant']);
    expect(align(['neither take they hold'], ['Neither do they attain'])).toEqual(['Neither:same:neither', 'do:-', 'they:same:they', 'attain:position:hold']);
    expect(isFunctionWord('the')).toBe(true);
    expect(isFunctionWord('springs')).toBe(false);
  });

  it('finds phrases the ASV moved, so their words are not matched elsewhere (Rom 8:28)', () => {
    const k = verseWords(KJV_ROM_8_28).words;
    const a = verseWords(ASV_ROM_8_28).words;
    expect(movedPhrases(k, a)).toEqual([[10, 4, 5]]); // "to them that love God"
    expect(align(KJV_ROM_8_28, ASV_ROM_8_28).slice(15)).toEqual(['even:-', 'to:same:to', 'them:same:them', 'that:similar:who', 'are:same:are', 'called:same:called', 'according:same:according', 'to:same:to', 'his:same:his', 'purpose:same:purpose']);
  });
});

describe('transferStrongs', () => {
  it('tags Genesis 1:1 word by word, grouping words of one KJV element', () => {
    const { segs, stats } = transferStrongs(KJV_GEN_1_1, ASV_GEN_1_1);
    expect(segs).toEqual([
      { t: 'In the beginning', s: ['H7225'] }, ' ', { t: 'God', s: ['H430'] }, ' ', { t: 'created', s: ['H853', 'H1254'], m: ['TH8804'] }, ' ',
      { t: 'the heavens', s: ['H8064'] }, ' ', { t: 'and', s: ['H853'] }, ' ', { t: 'the earth', s: ['H776'] }, '.',
    ]);
    expect(stats).toMatchObject({ words: 10, tagged: 10, rules: { same: 9, similar: 1, position: 0 } });
  });

  it('gives "Jehovah" the KJV LORD’s H3068 and leaves the KJV’s added "is" untagged (Ps 23:1)', () => {
    const { segs, stats } = transferStrongs(KJV_PS_23_1, ASV_PS_23_1);
    expect(segs).toEqual([
      { t: 'Jehovah', s: ['H3068'] }, ' is ', { t: 'my shepherd', s: ['H7462'], m: ['TH8802'] }, '; ', { t: 'I shall not want', s: ['H2637'], m: ['TH8799'] }, '.',
    ]);
    expect(stats).toMatchObject({ words: 8, tagged: 7, kjvUntagged: 1 });
  });

  it('carries "Holy Ghost" over to "Holy Spirit"', () => {
    const { segs } = transferStrongs(KJV_ACTS_2_4_PART, ['filled with the Holy Spirit,']);
    expect(tagOf(segs, 'Spirit')?.s).toEqual(['G4151']);
    expect(tagOf(segs, 'Holy')?.s).toEqual(['G40']);
  });

  it('keeps the moved "to them that love" on G25 and leaves italics untagged (Rom 8:28)', () => {
    const { segs, stats } = transferStrongs(KJV_ROM_8_28, ASV_ROM_8_28);
    expect(tagOf(segs, 'to them that love')?.s).toEqual(['G3588', 'G25']);
    expect(tagOf(segs, 'to them that are')?.s).toEqual(['G1510']);
    expect(segs).toContainEqual({ t: 'even', a: 1 });
    expect(segs).toContainEqual({ t: 'his', a: 1 });
    expect(stats.italic).toBe(1);
  });

  it('never tags a word the ASV prints in italics', () => {
    const { segs } = transferStrongs([{ t: 'he made', s: ['H6213'] }, ' it'], [{ t: 'he', a: 1 }, ' made it']);
    expect(segs).toEqual([{ t: 'he', a: 1 }, ' ', { t: 'made', s: ['H6213'] }, ' it']);
  });

  it('changes nothing but the tags', () => {
    for (const [kjv, asv] of [
      [KJV_GEN_1_1, ASV_GEN_1_1],
      [KJV_PS_23_1, ASV_PS_23_1],
      [KJV_ROM_8_28, ASV_ROM_8_28],
    ]) {
      expect(withoutStrongs(transferStrongs(kjv, asv).segs)).toEqual(asv);
    }
    expect(transferStrongs(KJV_GEN_1_1, []).segs).toEqual([]);
  });
});
