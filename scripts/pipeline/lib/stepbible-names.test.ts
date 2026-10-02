import { describe, expect, it } from 'vitest';

import { NameIndex, parseTipnr, properName } from './stepbible-names';

// Abridged TIPNR records (commit b99716b): header lines with their tab fields, sub-records starting
// with "– " (en dash), the Total line, and the AI-generated @ lines that must not be used.
const t = (...f: string[]) => f.join('\t');
const TIPNR = [
  '$==========PERSON(s)',
  t('UnifiedName=uStrong', 'Description', 'Parents Male+Female'),
  '‖==================',
  '$========== PERSON(s)',
  t('Abagtha@Est.1.10=H0005', 'Man living at the time of Exile and Return', ' + ', '', '', '', '>', '#A man living at the time of Exile and Return, only mentioned at <ref="Est.1.10">Est.1.10</ref>) <br>only referred to as <strong="H0005">Abagtha</strong> (אֲבַגְתָא).', 'Male'),
  t('– Named', 'Abagtha@Est.1.10', 'H0005«H0005=אֲבַגְתָא', 'Abagtha', 'Est.1.10'),
  t('– Total', 'Abagtha', 'H0005', 'Est.1.10; ', '1'),
  '@Briefest= Ahasuerus\' eunuch',
  '@Brief= One of King Ahasuerus\' seven eunuchs',
  '@Short= Abagtha was one of the seven eunuchs who served King Ahasuerus.',
  '$========== PERSON(s)',
  t('Abraham@Gen.11.26-1Pe=H0085', 'Man living at the time of the Patriarchs', 'Terah@Gen.11.24-Luk + ', '', '', '', '', '#A man…', 'Male'),
  t('– Named', 'Abram|Abraham@Gen.11.26-1Pe', 'H0087«H0087=אַבְרָם', 'Abram', 'Gen.11.26; Gen.11.27'),
  t('– Named', 'Abraham@Gen.11.26-1Pe', 'H0085«H0085=אַבְרָהָם', 'Abraham', 'Gen.17.5'),
  t('– Greek', 'Abraham@Gen.11.26-1Pe', 'G0011«G0011=Ἀβραάμ', 'Abraham', 'Mat.1.1'),
  '$========== PERSON(s)',
  t('Jesus@Isa.7.14-Rev=G2424G', 'Man living at the time of the New Testament', 'Joseph@Mat.1.16-Jhn + Mary@Mat.1.16-Act'),
  t('– Named', 'Jesus@Isa.7.14-Rev', 'G2424G«G2424=Ἰησοῦς', 'Jesus', 'Mat.1.1'),
  t('– Named', 'Christ|Jesus@Isa.7.14-Rev', 'G5547G«G5547=Χριστός', 'Christ', 'Mat.1.1'),
  '$========== PLACE',
  t('Bethlehem@Gen.35.16-Jhn=H1035G', 'Bethlehem_1', 'Salma@1Ch.2.51-=H8007H', '', 'https://www.google.com/maps/@31.70536129174666,35.21026630105202,14z', 'https://palopenmaps.org/view/9999/@31.70536129174666,35.21026630105202', 'Tribe of Judah', '#A location in Judah Tribe first mentioned at <ref="Gen.35.16">Gen.35.16</ref>) …', 'Place'),
  t('– Named', 'Bethlehem@Gen.35.16-Jhn', 'H1035G«H1035=בֵּית לֶ֫חֶם', 'Bethlehem =ESV,NIV; Beth-lehem =KJV', 'Gen.35.19'),
  t('– Total', 'Bethlehem or Lehem or Ephrath or Ephrathah', 'H1035G, H1022, H3433, H0672H, G0965', 'Gen.35.16; ', '55'),
  '@Brief= City of David\'s birth and Jesus\' birth.',
  '$========== PLACE',
  t('Jerusalem@Gen.14.18-Rev=H3389', 'Jerusalem', '', '', 'https://www.google.com/maps/@31.777444,35.234935,14z', '', '>', '#A location first mentioned at <ref="Jos.1">…', 'Place'),
  t('– Named', 'Jerusalem@Gen.14.18-Rev', 'H3389«H3389=יְרוּשָׁלַ֫םִ', 'Jerusalem', 'Jos.10.1'),
  '$========== OTHER',
  t('Abaddon@Job.26.6-Rev=H0011', 'A male deity/angel in the New Testament', '', '', '', '', '>', '#A male deity/angel…', 'Supernatural'),
  t('– Named', 'Abaddon@Job.26.6-Rev', 'H0011«H0011=אֲבַדּוֹן', 'Abaddon =ESV; Destruction =NIV,KJV', 'Job.26.6'),
];

describe('parseTipnr', () => {
  const records = parseTipnr(TIPNR);

  it('skips the templates and reads records with sub-records', () => {
    expect(records.map((r) => [r.id, r.category, r.subs.length])).toEqual([
      ['Abagtha@Est.1.10', 'PERSON(s)', 1],
      ['Abraham@Gen.11.26-1Pe', 'PERSON(s)', 3],
      ['Jesus@Isa.7.14-Rev', 'PERSON(s)', 2],
      ['Bethlehem@Gen.35.16-Jhn', 'PLACE', 1],
      ['Jerusalem@Gen.14.18-Rev', 'PLACE', 1],
      ['Abaddon@Job.26.6-Rev', 'OTHER', 1],
    ]);
    expect(records[1].subs[0]).toEqual({ significance: 'Named', uniqueName: 'Abram|Abraham@Gen.11.26-1Pe', dStrong: 'H0087', eStrong: 'H0087' });
  });

  it('builds ProperName from factual fields only', () => {
    const names = records.map(properName);
    expect(names[0]).toEqual({ id: 'Abagtha@Est.1.10', name: 'Abagtha', kind: 'person', sig: 'Man living at the time of Exile and Return' });
    expect(names[3]).toEqual({ id: 'Bethlehem@Gen.35.16-Jhn', name: 'Bethlehem', kind: 'place', sig: 'A location in Judah Tribe' });
    expect(names[4]).toEqual({ id: 'Jerusalem@Gen.14.18-Rev', name: 'Jerusalem', kind: 'place' });
    expect(names[5].kind).toBe('other');
    expect(JSON.stringify(names)).not.toMatch(/eunuch|City of David/);
  });
});

describe('NameIndex', () => {
  it('resolves text ids to TIPNR ids', () => {
    const index = new NameIndex(parseTipnr(TIPNR));
    expect(index.resolve('Abraham@Gen.11.26-1Pe', ['H0085'])).toBe('Abraham@Gen.11.26-1Pe'); // exact
    expect(index.resolve('Abraham|Abraham@Gen.11.26-1Pe', [])).toBe('Abraham@Gen.11.26-1Pe'); // unified part
    expect(index.resolve('Abram|Abraham@Gen.11.26-1Pe', [])).toBe('Abraham@Gen.11.26-1Pe');
    expect(index.resolve('Abraham|Abraham@Gen.11.26', ['G0011'])).toBe('Abraham@Gen.11.26-1Pe'); // TAGNT form, no range
    expect(index.resolve('Jerusalem@Jos.10.1-Rev', ['H3389'])).toBe('Jerusalem@Gen.14.18-Rev'); // by dStrong
    expect(index.resolve('Christ|Jesus@Mat.1.1', ['G5547'])).toBe('Jesus@Isa.7.14-Rev'); // by number
    expect(index.resolve('Jabesh-gilead@Jdg.21.8-1Ch', ['H1568L'])).toBeNull();
    expect(Object.fromEntries(index.stats)).toEqual({ exact: 1, unified: 2, firstRef: 1, dStrong: 1, eStrong: 1, unmatched: 1 });
    expect([...index.unmatched.keys()]).toEqual(['Jabesh-gilead@Jdg.21.8-1Ch']);
  });
});
