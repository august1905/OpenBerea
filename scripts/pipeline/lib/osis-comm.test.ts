import { describe, expect, it } from 'vitest';

import type { BookCode } from '../../../src/lib/bible/books';

import {
  commentaryBlocks,
  mhcMarkerRange,
  parseThmlPassage,
  prepareOsis,
  prepareScripRefs,
  type RefStats,
  splitBarnes,
  splitJfb,
  splitMultiRefs,
  thmlBook,
} from './osis-comm';
import { blocksToText } from './richtext';

const stats = (): RefStats => ({ links: 0, failed: [] });
const JHN3: { book: BookCode; chapter: number } = { book: 'JHN', chapter: 3 };
const refs = (p: string, ctx = JHN3) => parseThmlPassage(p, ctx).items.map((i) => i.ref);

// Excerpts of real entries (JFB 3.0, MHC 2.2, Barnes 1.1).
const JFB_JOHN_3_16_ORPHAN =
  '<div type="x-milestone" subType="x-preverse" sID="pv14904"/><div sID="gen28764" type="x-p"/><div type="x-milestone" subType="x-preverse" eID="pv14904"/><hi type="bold">16. For God so loved, &amp;c.--</hi>What proclamation of the Gospel has been so oft on the lips of missionaries and preachers in every age since it was first uttered? … "spared not His own Son" (<reference osisRef="Rom.8.32">Ro 8:32</reference>) … with healing in His wings! (Mal 4:2). <div eID="gen28764" type="x-p"/>';
const JFB_GEN_29 =
  '<div sID="gen504" type="x-p"/><hi type="bold">17. Leah tender-eyed--</hi>that is, soft blue eyes. <hi type="bold">Rachel beautiful and well favoured--</hi>that is, handsome. <div eID="gen504" type="x-p"/> <div sID="gen505" type="x-p"/><hi type="bold">18. I will serve thee seven years--</hi>Having no dowry to give. <div eID="gen505" type="x-p"/>';
const MHC_PS_95_ORPHAN =
  '<div eID="gen12201" type="x-p"/> <title type="x-s3">Warning against Hardness of Heart.</title> <div sID="gen12202" type="x-p"/> <hi type="super">7</hi>—To day if ye will hear his voice, <hi type="super">8</hi> Harden not your heart, … <hi type="super">11</hi> Unto whom I sware in my wrath that they should not enter into my rest.';
const MHC_2PET_2_ORPHAN =
  '<div eID="gen33572" type="x-p"/> <title type="x-s3">Divine Judgments. (<hi type="small-caps">a. d.</hi> 67.)</title> <div sID="gen33573" type="x-p"/> <hi type="super"></hi>—3 Whose judgment now of a long time lingereth not, … <hi type="super">4</hi> For if God spared not the angels … <hi type="super">6</hi> And turning the cities';
const BARNES_LUKE_10_9 = 'Verses 8-12. <scripRef passage="Mt 10:14">Mt 10:14</scripRef>, <scripRef passage="Mt 10:15">Mt 10:15</scripRef>. <br /><br /> Verse 9. <br /><br /> (l) "The kingdom of God" <scripRef passage="Mt 3:2">Mt 3:2</scripRef>.';
const BARNES_MATT_1_1_TAIL =
  'See Lardher\'s works, vol. v. pp. 296, 297. ======== <br /><br />                   GOSPEL ACCORDING TO MATTHEW. <br /><br />    1. The book of the generation. This is the proper title of the chapter.';

describe('splitJfb', () => {
  it('splits at bold verse headers that start a paragraph', () => {
    const parts = splitJfb(JFB_GEN_29);
    expect(parts.map((p) => p.head)).toEqual([
      [17, 17],
      [18, 18],
    ]);
    expect(parts[0].html).toContain('Rachel beautiful');
  });

  it('finds the header of an orphaned comment (John 3:16)', () => {
    const parts = splitJfb(JFB_JOHN_3_16_ORPHAN);
    expect(parts).toHaveLength(1);
    expect(parts[0].head).toEqual([16, 16]);
  });

  it('reads ranges and, for orphans, plain-number headers', () => {
    expect(splitJfb('<div sID="g1" type="x-p"/><hi type="bold">14-16. And as Moses, &amp;c.--</hi>Here now…')[0].head).toEqual([14, 16]);
    expect(splitJfb('<div sID="g1" type="x-p"/>24. This incident could scarcely have happened', true)[0].head).toEqual([24, 24]);
    expect(splitJfb('<div sID="g1" type="x-p"/>24. This incident could scarcely have happened')[0].head).toBeNull();
  });
});

describe('mhcMarkerRange', () => {
  it('takes the range of the quoted passage from its superscript verse numbers', () => {
    expect(mhcMarkerRange(MHC_PS_95_ORPHAN)).toEqual([7, 11]);
    expect(mhcMarkerRange(MHC_2PET_2_ORPHAN)).toEqual([3, 6]);
    expect(mhcMarkerRange('<title type="x-s3">No markers</title> text')).toBeNull();
  });
});

describe('splitBarnes', () => {
  it('splits a range note from the verse’s own note', () => {
    expect(splitBarnes(BARNES_LUKE_10_9).map((p) => p.head)).toEqual([
      [8, 12],
      [9, 9],
    ]);
  });

  it('accepts "Verses 2,3" without a period and a book-name prefix', () => {
    expect(splitBarnes('Verses 2,3 <i>As it is written in the prophets</i>.')[0].head).toEqual([2, 3]);
    expect(splitBarnes('Matthew Verses 2-16 <br /><br /> Verses 2-16. These verses contain the genealogy').map((p) => p.head)).toEqual([
      [2, 16],
      [2, 16],
    ]);
    expect(splitBarnes('See Verse 5. for this').map((p) => p.head)).toEqual([null]);
  });

  it('finds the plain "1." that starts Matt 1:1 after the preface', () => {
    const parts = splitBarnes(BARNES_MATT_1_1_TAIL, true);
    expect(parts.map((p) => p.head)).toEqual([null, [1, 1]]);
    expect(parts[1].html.startsWith('1. The book of the generation')).toBe(true);
  });
});

describe('ThML passages', () => {
  it('resolves books, chapters, and verse lists', () => {
    expect(refs('Jn 6:33, 17:21')).toEqual(['JHN.6.33', 'JHN.17.21']);
    expect(refs('Ps 132:10,11')).toEqual(['PSA.132.10', 'PSA.132.11']);
    expect(refs('Mk 7:34, Mt 27:46')).toEqual(['MRK.7.34', 'MAT.27.46']);
    expect(refs('2Sam 6:12; 1Kgs 8:1')).toEqual(['2SA.6.12', '1KI.8.1']);
    expect(refs('De 22:23, 24')).toEqual(['DEU.22.23', 'DEU.22.24']);
    expect(refs('Gen 21:2-5')).toEqual(['GEN.21.2-5']);
    expect(refs('Acts 24:1-25:27')).toEqual(['ACT.24.1-25.27']);
    expect(refs('Mt 15.28')).toEqual(['MAT.15.28']);
    expect(refs('Mt 4')).toEqual(['MAT.4']);
    expect(refs('Jude 1:6')).toEqual(['JUD.1.6']);
  });

  it('resolves bare references against the passage being explained', () => {
    expect(refs('1:14,18')).toEqual(['JHN.1.14', 'JHN.1.18']);
    expect(refs('15')).toEqual(['JHN.3.15']);
    expect(refs('25:41', { book: 'MAT', chapter: 3 })).toEqual(['MAT.25.41']);
  });

  it('fixes Barnes’ misspelled book names', () => {
    expect(thmlBook('1Timm')).toBe('1TI');
    expect(thmlBook('Gall')).toBe('GAL');
    expect(thmlBook('Romm')).toBe('ROM');
    expect(thmlBook('Actst')).toBe('ACT');
    expect(thmlBook('Co')).toBe('COL');
    expect(thmlBook('Jud')).toBe('JDG');
    expect(thmlBook('Jud', 'JUD')).toBe('JUD');
    expect(refs('Jud 1:31', { book: 'MAT', chapter: 11 })).toEqual(['JDG.1.31']);
  });

  it('reports what it cannot read', () => {
    const p = parseThmlPassage('Rom 8:13:1', JHN3);
    expect(p.items).toEqual([]);
    expect(p.errors).toEqual(['Rom 8:13:1']);
  });

  it('gives each reference of a list its own link (Barnes John 3:16)', () => {
    const st = stats();
    const out = prepareScripRefs('See <scripRef passage="Jn 6:33, 17:21">Jn 6:33, 17:21</scripRef>.', JHN3, st);
    expect(out).toBe('See <scripRef data-ref="JHN.6.33">Jn 6:33</scripRef>, <scripRef data-ref="JHN.17.21">17:21</scripRef>.');
    expect(st.links).toBe(2);
    const blocks = commentaryBlocks(out, st);
    expect(blocks[0].c).toEqual(['See ', { t: 'Jn 6:33', ref: 'JHN.6.33' }, ', ', { t: '17:21', ref: 'JHN.17.21' }, '.']);
  });

  it('links the whole text to the first reference when text and passage differ', () => {
    const st = stats();
    expect(prepareScripRefs('<scripRef version="Barnes" passage="Jn 1:14">the Word</scripRef>', JHN3, st)).toBe(
      '<scripRef data-ref="JHN.1.14">the Word</scripRef>',
    );
  });
});

describe('OSIS commentary markup', () => {
  it('turns paragraph milestones into paragraphs, keeps marks, and links osisRefs', () => {
    const st = stats();
    const blocks = commentaryBlocks(prepareOsis(JFB_GEN_29), st);
    expect(blocksToText(blocks)).toBe(
      '17. Leah tender-eyed--that is, soft blue eyes. Rachel beautiful and well favoured--that is, handsome.\n18. I will serve thee seven years--Having no dowry to give.',
    );
    expect(blocks[0].c[0]).toEqual({ t: '17. Leah tender-eyed--', b: 1 });
    const j316 = commentaryBlocks(prepareOsis(JFB_JOHN_3_16_ORPHAN), st);
    expect(j316[0].c).toContainEqual({ t: 'Ro 8:32', ref: 'ROM.8.32' });
    // Prose references without markup are linked too.
    expect(j316[0].c).toContainEqual({ t: 'Mal 4:2', ref: 'MAL.4.2' });
  });

  it('upper-cases small capitals and keeps superscript verse numbers and headings', () => {
    const st = stats();
    const blocks = commentaryBlocks(prepareOsis(MHC_2PET_2_ORPHAN), st);
    expect(blocks[0]).toEqual({ k: 'h', c: ['Divine Judgments. (A. D. 67.)'] });
    expect(blocks[1].c).toContainEqual({ t: '4', sup: 1 });
  });

  it('splits a reference element that lists several osisRefs', () => {
    expect(splitMultiRefs('<reference osisRef="Gen.49.5 Gen.49.7">Ge 49:5, 7</reference>')).toBe(
      '<reference osisRef="Gen.49.5">Ge 49:5</reference>, <reference osisRef="Gen.49.7">7</reference>',
    );
    expect(splitMultiRefs('<reference osisRef="John.1.3 John.1.10">John 1:3</reference>')).toBe('<reference osisRef="John.1.3">John 1:3</reference>');
  });

  it('removes links that are not valid in the KJV versification', () => {
    const st = stats();
    const blocks = commentaryBlocks('<p>See <reference osisRef="Jas.9.7">Jas 9:7</reference> and Jos 17:1-19.</p>', st);
    expect(blocks[0].c).toEqual(['See Jas 9:7 and Jos 17:1-19.']);
    // The tagged ref fails validation here; the prose ref (Joshua 17 has 18 verses) is already left
    // as plain text by linkRefs.
    expect(st.failed).toEqual(['Jas.9.7']);
  });

  it('tags Greek in Barnes', () => {
    const blocks = commentaryBlocks('Verse 4. <i>And declared</i>. In the margin, determined. τουορισθεντος. The ancient Syriac', stats());
    expect(blocks[0].c).toContainEqual({ t: 'τουορισθεντος', l: 'grc' });
  });
});
