import { describe, expect, it } from 'vitest';

import type { Block } from '../../../src/lib/data/types';
import {
  assignBuckets,
  cleanIsbeMarkers,
  finishBlocks,
  fixSmithPassage,
  groupByKey,
  isEmptyEntry,
  naveEntryToBlocks,
  slugify,
  TargetIndex,
  teiEntryToBlocks,
  thmlEntryToBlocks,
  titleCase,
  typography,
  uniqueSlugs,
} from './dict-convert';

const text = (b: Block) => b.c.map((p) => (typeof p === 'string' ? p : p.t)).join('');
const refs = (blocks: Block[]) => blocks.flatMap((b) => b.c.filter((p) => typeof p !== 'string' && p.ref).map((p) => (p as { ref: string }).ref));

describe('ids and titles', () => {
  it('makes URL-safe slugs, unique per dictionary', () => {
    expect(slugify('ABRAHAM’S BOSOM')).toBe('abraham-s-bosom');
    expect(slugify('NICANOR (1)')).toBe('nicanor-1');
    expect(uniqueSlugs(['AGRIPPA I', 'AGRIPPA I.', 'A', 'A-2', 'A'])).toEqual(['agrippa-i', 'agrippa-i-2', 'a', 'a-2', 'a-3']);
  });
  it('title-cases upper-case headwords in the printed style', () => {
    expect(titleCase("AARON'S ROD")).toBe("Aaron's Rod");
    expect(titleCase('BETH-EL')).toBe('Beth-el');
    expect(titleCase('ABIA, ABIAH, OR ABIJAH')).toBe('Abia, Abiah, or Abijah');
    expect(titleCase('AGRIPPA II.')).toBe('Agrippa II.');
    expect(titleCase('BEN-HUR (R. V.)')).toBe('Ben-hur (R. V.)');
    expect(titleCase('ACTS OF THE APOSTLES')).toBe('Acts of the Apostles');
  });
  it('fills buckets up to the target size', () => {
    expect(assignBuckets([100, 100, 100, 250, 100], 220)).toEqual([0, 0, 1, 2, 3]);
    // A small last bucket joins the previous one when they fit in `max`.
    expect(assignBuckets([100, 100, 100, 100, 10], 220, 300)).toEqual([0, 0, 1, 1, 1]);
  });
  it('groups repeated keys', () => {
    expect(groupByKey([{ key: 'AB' }, { key: 'AB' }, { key: 'ABA' }]).map((g) => g.length)).toEqual([2, 1]);
  });
});

describe('finishBlocks', () => {
  it('turns link sentinels into href and s fields and drops invalid refs', () => {
    const out = finishBlocks([{ k: 'p', c: [{ t: 'MOSES', ref: '@/study/dictionary/easton/moses' }, ' ', { t: 'H433', ref: '§H433' }, ' ', { t: 'x', ref: 'GEN.1.99' }] }]);
    expect(out[0].c).toEqual([{ t: 'MOSES', href: '/study/dictionary/easton/moses' }, ' ', { t: 'H433', s: 'H433' }, ' ', 'x']);
  });
});

describe('TEI entries (Easton, ISBE)', () => {
  it('converts ISBE AARON (module text): headings, refs', () => {
    const tei =
      '<entryFree n="AARON">\n<p>ar\'-un, sometimes pronounced ar\'on:</p><p><hi rend="underline">1. Family:</hi></p><p>Probably eldest son of Amram (<ref osisRef="Bible:Exod.6.20">Ex 6:20</ref>), and according to the uniform genealogical lists (<ref osisRef="Bible:Exod.6.16-Exod.6.20">Ex 6:16-20</ref>; <ref osisRef="Bible:1Chr.6.1-1Chr.6.3">1Ch 6:1-3</ref>), the fourth from Levi.</p>\n</entryFree>';
    const { blocks, title, refs: stats } = teiEntryToBlocks(tei);
    expect(title).toBeUndefined();
    expect(blocks.map((b) => b.k)).toEqual(['p', 'h', 'p']);
    expect(text(blocks[1])).toBe('1. Family:');
    expect(refs(blocks)).toEqual(['EXO.6.20', 'EXO.6.16-20', '1CH.6.1-3']);
    expect(stats.ok).toBe(3);
  });
  it('takes the Easton <title> and links cross-entry refs', () => {
    const tei = '<entryFree n="Aaron">\n<title>Aaron</title>\n<p>(See <ref target="Easton:MOSES">MOSES</ref>.)</p>\n</entryFree>';
    const { blocks, title } = teiEntryToBlocks(tei, { target: () => ({ href: '/study/dictionary/easton/moses' }) });
    expect(title).toBe('Aaron');
    expect(blocks[0].c).toEqual(['(See ', { t: 'MOSES', href: '/study/dictionary/easton/moses' }, '.)']);
  });
});

describe('cleanIsbeMarkers', () => {
  it('removes e-text markers from ISBE text (module text)', () => {
    expect(cleanIsbeMarkers('a-pos\'-l ([ @apostolos], literally); "beautiful" (~to\'ar, <ref osisRef="Bible:1Sam.25.3">1Sa 25:3</ref>); (/APC Tobit 1:21)')).toBe(
      'a-pos\'-l ([ apostolos], literally); "beautiful" (to\'ar, <ref osisRef="Bible:1Sam.25.3">1Sa 25:3</ref>); (Tobit 1:21)',
    );
  });
});

describe('Nave', () => {
  const love =
    '<entryFree n="LOVE">\n<def>\n<lb/>→ OF CHILDREN FOR PARENTS\n<list>\n<item>See <ref target="Nave:CHILDREN">CHILDREN</ref></item>\n</list>\n<lb/>→ OF MAN FOR GOD <ref osisRef="Exod.20.6">Ex 20:6</ref>; <ref osisRef="Deut.5.10">De 5:10</ref>; <ref osisRef="Deut.6.5">6:5</ref>\n<lb/>→ INSTANCES OF LOVE FOR JESUS\n<list>\n<item>Mary <ref osisRef="Matt.26.6-Matt.26.13">Mt 26:6-13</ref>; <ref osisRef="John.12.3-John.12.8">Joh 12:3-8</ref>; <ref osisRef="Luke.10.39">Lu 10:39</ref></item>\n</list>\n<lb/>→ See <ref target="Nave:PRIEST">PRIEST</ref>, HIGH</def>\n</entryFree>';
  it('keeps the topic structure of LOVE (module text)', () => {
    const { blocks } = naveEntryToBlocks(love, 'LOVE', { target: (t) => ({ href: `/study/dictionary/nave/${t.slice(5).toLowerCase()}` }) });
    expect(blocks.map((b) => `${b.k}${b.d ?? ''}`)).toEqual(['h', 'li0', 'p', 'h', 'li0', 'p']);
    expect(text(blocks[0])).toBe('OF CHILDREN FOR PARENTS');
    expect(blocks[2].c[0]).toEqual({ t: 'OF MAN FOR GOD', b: 1 });
    expect(refs([blocks[2]])).toEqual(['EXO.20.6', 'DEU.5.10', 'DEU.6.5']);
    expect(text(blocks[4])).toBe('Mary Mt 26:6-13; Joh 12:3-8; Lu 10:39');
    expect(refs([blocks[4]])).toEqual(['MAT.26.6-13', 'JHN.12.3-8', 'LUK.10.39']);
    expect(blocks[5].c[0]).toBe('See ');
  });
});

describe('ThML (Smith)', () => {
  it('converts Smith AARON (module text): italics, passages, terms, quotes', () => {
    const thml =
      '(<i>a teacher, or lofty</i>), the son of Amram and Jochebed. (<scripRef passage="nu 26:59">Numbers 26:59</scripRef>; <scripRef passage="nu 33:39">33:39</scripRef>) He was "slow of speech;" (<scripRef passage="de 9:20">9:20</scripRef>) See <term>MOSES</term>.';
    const { blocks } = thmlEntryToBlocks(thml, { term: () => ({ href: '/study/dictionary/smith/moses' }) });
    expect(blocks[0].c[0]).toEqual('(');
    expect(blocks[0].c[1]).toEqual({ t: 'a teacher, or lofty', i: 1 });
    expect(refs(blocks)).toEqual(['NUM.26.59', 'NUM.33.39', 'DEU.9.20']);
    expect(text(blocks[0])).toContain('“slow of speech;”');
    expect(blocks[0].c).toContainEqual({ t: 'MOSES', href: '/study/dictionary/smith/moses' });
  });
  it('fixes the "phm" abbreviation used for Philippians', () => {
    expect(fixSmithPassage('<scripRef passage="phm 3:21">Philemon 3:21</scripRef><scripRef passage="phm 1:24">')).toBe('<scripRef passage="php 3:21">Philemon 3:21</scripRef><scripRef passage="phm 1:24">');
  });
  it('sets typographic quotes and dashes outside tags', () => {
    expect(typography('the sixth day--the last <i>"crowning"</i> act "done."')).toBe('the sixth day—the last <i>“crowning”</i> act “done.”');
  });
});

describe('TargetIndex', () => {
  const t = new TargetIndex(
    ['THORN', 'COMMANDMENTS, THE TEN', 'SILOAM, POOL OF', 'SILOAM, TOWER OF', 'ABSALOM (1)', 'ABSALOM (2)', 'ABIGAIL; ABIGAL', 'WICKED (PEOPLE)'].map((key) => ({ key, id: slugify(key) })),
  );
  it('resolves plurals, unique extensions, alternatives and numbered homonyms', () => {
    expect(t.find('Easton:THORNS')).toBe('thorn');
    expect(t.find('Easton:COMMANDMENTS')).toBe('commandments-the-ten');
    expect(t.find('ISBE:ABIGAL')).toBe('abigail-abigal');
    expect(t.find('ISBE:ABSALOM')).toBe('absalom-1');
    expect(t.find('Nave:WICKED')).toBe('wicked-people');
    expect(t.find('Easton:SILOAM')).toBeNull();
    expect(t.unresolved).toEqual(['Easton:SILOAM']);
  });
});

describe('isEmptyEntry', () => {
  it('detects entries without article text', () => {
    expect(isEmptyEntry([])).toBe(true);
    expect(isEmptyEntry([{ k: 'p', c: ['W. Ewing'] }])).toBe(true);
    expect(isEmptyEntry([{ k: 'p', c: ['See ', { t: 'AYIN', href: '/study/dictionary/isbe/ayin' }, '.'] }])).toBe(false);
  });
});
