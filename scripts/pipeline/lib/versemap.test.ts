import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildVerseMap,
  expandedConfirms,
  fallbackRules,
  loadVerseMap,
  parseEnglishTable,
  parseExpandedRows,
  parseOsisVerse,
  parseTvtmsRef,
  tableRules,
  TVTMS_PATH,
} from './versemap';

// Lines copied from TVTMS (STEPBible, CC BY 4.0): the English-versions table from the header and
// the Expanded NT rows for the same verses. Cells are tab-separated in the source.
const row = (...cells: string[]) => cells.join('\t');
const SAMPLE = [
  'In the OT, all English versions agree with KJV. In the DC (DeuteroCanon or Apocryphra) there are numerous differences. In the NT, KJV differs from other versions at:',
  ',',
  row('NA/ SBLG', 'NET2full/ NRSV', 'ESV', 'NIV', 'KJV', 'MAPPINGS  * = KJV', '', ''),
  row('*Act.19:40', 'Act.19:40-41', 'Act.19:40-41', 'Act.19:40-41', 'Act.19:40-41', 'Acts.19.40!a=Acts.19.40 & Acts.19.40!b=Acts.19.41'),
  row('*2Co.13:12', '*2Co.13:12', '2Co.13:12-13', '2Co.13:12-13', '2Co.13:12-13', '2Cor.13.12!a=2Cor.13.12 & 2Cor.13.12!b=2Cor.13.13'),
  row('*2Co.13:13', '*2Co.13:13', '2Co.13:14', '2Co.13:14', '2Co.13:14', '2Cor.13.13=2Cor.13.14'),
  row('*Php.1:16', '*Php.1:16', '*Php.1:16', '*Php.1:16', 'Php.1:17', 'Phil.1.16=Phil.1.17'),
  row('*Php.1:17', '*Php.1:17', '*Php.1:17', '*Php.1:17', 'Php.1:16', 'Phil.1.17=Phil.1.16'),
  row('*3Jn.1:14-15', '*3Jn.1:14-15', '*3Jn.1:14-15', '3Jn.1:14', '3Jn.1:14', '3John.1.14=3John.1.15!a & 3John.1.15=3John.1.15!b'),
  row('Rev.12:17', 'Rev.12:17', 'Rev.12:17a', 'Rev.12:17', 'Rev.12:17', ''),
  row('*Rev.12:18', '*Rev.12:18', 'Rev.12:17b', 'Rev.13:1a', 'Rev.13:1a', 'Rev.12.18=Rev.13.1!a'),
  row('*Rev.13.1', '*Rev.13.1', '*Rev.13.1', 'Rev.13:1b', 'Rev.13:1b', 'Rev.13.1=Rev.13.1!b'),
  ',',
  '#DataStart(Expanded)',
  row('SourceType', 'SourceRef', 'StandardRef', 'Action', 'NoteMarker', 'Reversification Note ', 'Versification Note ', 'Ancient Versions ', 'Tests'),
  row('Eng-KJV+Greek2', 'Act.19:41', 'Act.19:41', 'Keep verse', 'Acd. (41)^[40b]', '', '', '', 'Act.19:41=Exist & Act.19:41=Last'),
  row('Greek2', 'Rom.14:24', 'Rom.16:25', 'Renumber verse*', 'Nec. (25)^14:24', '', '', '', 'Rom.14:24=Exist & Rom.16:24=Last'),
  row('Greek+NRSV', '2Co.13:13', '2Co.13:14', 'Renumber verse', 'Opt. (14)^13', '', '', '', '2Co.13:13=Exist & 2Co.13:13=Last'),
  row('Greek', 'Php.1:16', 'Php.1:17', 'Renumber verse*', 'Opt. (17)^16', '', '', '', 'Php.1:16=Exist & Php.1:16<Php.1:17'),
  row('Greek', 'Php.1:17', 'Php.1:16', 'Renumber verse*', 'Opt. (16)^17', '', '', '', 'Php.1:17=Exist & Php.1:16<Php.1:17'),
  row('Greek', '3Jn.1:14-15', '3Jn.1:14', 'Concatenation', 'Opt. (14)^14b', '', '', '', '3Jn.1:14=Exist & 3Jn.1:15=Last'),
  row('Greek', '3Jn.1:15', '3Jn.1:14!b', 'DividedPrev verse', 'Opt. ^15', '', '', '', '3Jn.1:15=Exist & 3Jn.1:15=Last'),
  row('English2+Latin+Greek', 'Rev.12:18; 13:1', 'Rev.13:1', 'Concatenation', 'Nec. (1)^12:18+13:1', '', '', '', 'Rev.12:18=Exist & Rev.12:18=Last'),
  row('English2+Latin+Greek', 'Rev.12:18', 'Rev.13:1!a', 'Renumber verse', 'Nec. (1)^12:18+13:1', '', '', '', 'Rev.12:18=Exist & Rev.12:18=Last'),
  row('Latin', 'Mal.3:19', 'Mal.4:1', 'Renumber verse', '', '', '', '', 'Mal.3:19=Exist'),
  '#DataEnd(Expanded)',
].join('\n');

const key = (r: { book: string; chapter: number; verse: number } | null) => (r ? `${r.book}.${r.chapter}.${r.verse}` : null);

describe('TVTMS parsing', () => {
  it('parses refs, ranges, subverses and the "Rev.13.1" typo form', () => {
    expect(parseTvtmsRef('Act.19:40-41')).toEqual({ book: 'ACT', chapter: 19, verse: 40, endVerse: 41 });
    expect(parseTvtmsRef('*Rev.12:17a')).toEqual({ book: 'REV', chapter: 12, verse: 17, part: 'a' });
    expect(parseTvtmsRef('3Jn.1:14!b')).toEqual({ book: '3JN', chapter: 1, verse: 14, part: 'b' });
    expect(parseTvtmsRef('*Rev.13.1')).toEqual({ book: 'REV', chapter: 13, verse: 1 });
    expect(parseTvtmsRef('Rev.12:18; 13:1')).toBeNull();
    expect(parseTvtmsRef('Psa.51:Title')).toBeNull();
    expect(parseTvtmsRef('Sir.20:16')).toBeNull();
  });

  it('reads the English-versions table', () => {
    const t = parseEnglishTable(SAMPLE);
    expect(t.columns).toEqual(['NA/ SBLG', 'NET2full/ NRSV', 'ESV', 'NIV', 'KJV']);
    expect(t.rows).toHaveLength(9);
  });

  it('derives ESV and NRSV differences from the table', () => {
    const t = parseEnglishTable(SAMPLE);
    expect(tableRules(t, 'esv')).toEqual([
      { from: 'PHP.1.16', to: 'PHP.1.17', kind: 'reorder' },
      { from: 'PHP.1.17', to: 'PHP.1.16', kind: 'reorder' },
      { from: '3JN.1.15', to: '3JN.1.14', kind: 'table' },
    ]);
    expect(tableRules(t, 'nrsv').filter((r) => r.kind === 'table')).toEqual([
      { from: '2CO.13.13', to: '2CO.13.14', kind: 'table' },
      { from: '3JN.1.15', to: '3JN.1.14', kind: 'table' },
      { from: 'REV.12.18', to: 'REV.13.1', kind: 'table' },
    ]);
  });

  it('confirms table rules against Expanded rows and finds NT fallbacks', () => {
    const rows = parseExpandedRows(SAMPLE);
    expect(rows).toHaveLength(10);
    expect(expandedConfirms(rows, { from: '3JN.1.15', to: '3JN.1.14', kind: 'table' })).toBe(true);
    expect(expandedConfirms(rows, { from: '3JN.1.15', to: '3JN.1.13', kind: 'table' })).toBe(false);
    // Only NT source verses that the KJV lacks; Mal.3:19 (OT, Hebrew numbering) is not a fallback.
    expect(fallbackRules(rows).map((r) => `${r.from}>${r.to}`)).toEqual(['ROM.14.24>ROM.16.25', '3JN.1.15>3JN.1.14', 'REV.12.18>REV.13.1']);
  });
});

describe('buildVerseMap (inline sample)', () => {
  const esv = buildVerseMap(SAMPLE);

  it('maps the known ESV-vs-KJV differences', () => {
    expect(key(esv.mapOsis('3John.1.15'))).toBe('3JN.1.14');
    expect(esv.mapOsis('3John.1.15')?.rule).toBe('table');
    expect(key(esv.mapOsis('3John.1.14'))).toBe('3JN.1.14');
    expect(esv.mapOsis('3John.1.14')?.rule).toBeUndefined();
  });

  it('keeps verses that ESV and KJV number alike', () => {
    for (const osis of ['Acts.19.40', 'Acts.19.41', '2Cor.13.12', '2Cor.13.13', '2Cor.13.14', 'Rev.12.17', 'Rev.13.1', 'Rom.16.24', 'Rom.16.25', 'Rom.16.27', 'Mal.4.6', 'Phil.1.16']) {
      const r = esv.mapOsis(osis);
      expect(r?.rule).toBeUndefined();
      expect(key(r)).toBe(key(parseOsisVerse(osis)));
    }
  });

  it('maps non-KJV verses through the Expanded fallback', () => {
    expect(key(esv.mapOsis('Rev.12.18'))).toBe('REV.13.1');
    expect(esv.mapOsis('Rev.12.18')?.rule).toBe('fallback');
    expect(key(esv.mapOsis('Rom.14.24'))).toBe('ROM.16.25');
  });

  it('applies the Phil 1:16/17 text-order swap only when asked', () => {
    const ordered = buildVerseMap(SAMPLE, { contentOrder: true });
    expect(key(ordered.mapOsis('Phil.1.16'))).toBe('PHP.1.17');
    expect(key(ordered.mapOsis('Phil.1.17'))).toBe('PHP.1.16');
  });

  it('follows the NRSV column when asked', () => {
    const nrsv = buildVerseMap(SAMPLE, { scheme: 'nrsv' });
    expect(key(nrsv.mapOsis('2Cor.13.13'))).toBe('2CO.13.14');
    expect(key(nrsv.mapOsis('Rev.12.18'))).toBe('REV.13.1');
    expect(nrsv.mapOsis('Rev.12.18')?.rule).toBe('table');
  });

  it('returns null for verses that exist in no KJV numbering', () => {
    expect(esv.mapOsis('3John.1.16')).toBeNull();
    expect(esv.mapOsis('Mal.4.7')).toBeNull();
    expect(esv.mapOsis('Gen.0.1')).toBeNull();
    expect(esv.mapOsis('Tob.1.1')).toBeNull();
    expect(esv.mapOsis('nonsense')).toBeNull();
  });

  it('throws when a table rule has no Expanded row', () => {
    const broken = SAMPLE.replace(row('Greek', '3Jn.1:15', '3Jn.1:14!b', 'DividedPrev verse', 'Opt. ^15', '', '', '', '3Jn.1:15=Exist & 3Jn.1:15=Last'), '');
    expect(() => buildVerseMap(broken)).toThrow(/3JN.1.15/);
  });
});

describe('parseOsisVerse', () => {
  it('uses OpenBible/Theographic OSIS codes', () => {
    expect(parseOsisVerse('3John.1.15')).toEqual({ book: '3JN', chapter: 1, verse: 15 });
    expect(parseOsisVerse('Ps.23.1')).toEqual({ book: 'PSA', chapter: 23, verse: 1 });
    expect(parseOsisVerse('Song.1.1')).toEqual({ book: 'SNG', chapter: 1, verse: 1 });
    expect(parseOsisVerse('Phlm.1.6')).toEqual({ book: 'PHM', chapter: 1, verse: 6 });
    expect(parseOsisVerse('John.3.16-John.3.17')).toBeNull();
  });
});

describe.skipIf(!existsSync(TVTMS_PATH))('loadVerseMap (pinned TVTMS file)', () => {
  it('has exactly one ESV renumbering, 3 John 1:15', () => {
    const vm = loadVerseMap();
    expect(vm.rules.filter((r) => r.kind === 'table').map((r) => `${r.from}>${r.to}`)).toEqual(['3JN.1.15>3JN.1.14']);
    expect(key(vm.mapOsis('Rev.12.18'))).toBe('REV.13.1');
    expect(key(vm.mapOsis('Rom.14.26'))).toBe('ROM.16.27');
    expect(key(vm.mapOsis('Acts.19.41'))).toBe('ACT.19.41');
  });
});
