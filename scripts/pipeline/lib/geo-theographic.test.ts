import { describe, expect, it } from 'vitest';

import { verseId } from '../../../src/lib/bible/refs';
import {
  compressVerseIds,
  dictLinkRef,
  dictToBlocks,
  dropInvalidRefs,
  durationYears,
  eventEndYear,
  eventYear,
  matchPlace,
  personTitle,
  personYear,
  slugify,
  theoVerseId,
  usableNote,
} from './geo-theographic';

describe('years', () => {
  it('reads event startDate as astronomical years', () => {
    // "Reign of Saul" startDate "-1094" = 1095 BC; "Creation of all things" "-4003" = 4004 BC.
    expect(eventYear('-1094')).toBe(-1095);
    expect(eventYear('-4003')).toBe(-4004);
    expect(eventYear('0')).toBe(-1);
    expect(eventYear('30')).toBe(30);
    expect(eventYear('0030-04-04')).toBe(30);
    expect(eventYear('0029-10-9')).toBe(29);
  });

  it('reads person years as BC-negative already', () => {
    expect(personYear('-1015')).toBe(-1015);
    expect(personYear('30')).toBe(30);
    expect(personYear(undefined)).toBeUndefined();
    expect(() => personYear('0')).toThrow();
  });

  it('computes durations and end years', () => {
    expect(durationYears('40Y')).toBe(40);
    expect(durationYears('3M10D')).toBeCloseTo(0.25 + 10 / 365.25, 9);
    expect(durationYears('1.5Y')).toBe(1.5);
    expect(durationYears('1W')).toBeCloseTo(7 / 365.25, 9);
    expect(() => durationYears('NYNM')).toThrow();
    // Reign of David: "-1054", "40Y" → 1055–1015 BC. Rehoboam "-974" 17Y → 975–958 BC.
    expect(eventEndYear('-1054', '40Y')).toBe(-1015);
    expect(eventEndYear('-974', '17Y')).toBe(-958);
    expect(eventEndYear('-725', '29Y')).toBe(-697);
    // Jeconiah "-597" 3M10D stays in 598 BC; an event crossing year 0 lands in AD.
    expect(eventEndYear('-597', '3M10D')).toBe(-598);
    expect(eventEndYear('-3', '5Y')).toBe(2);
    expect(eventEndYear('0030-04-04', '1D')).toBe(30);
  });
});

describe('ids and refs', () => {
  it('slugifies titles', () => {
    expect(slugify('Reign of Ahaziah (Jehoahaz)')).toBe('reign-of-ahaziah-jehoahaz');
    expect(slugify("Peter preaches in Solomon's Portico")).toBe('peter-preaches-in-solomons-portico');
  });

  it('converts verseID and compresses verse runs', () => {
    expect(theoVerseId('43003016')).toBe(verseId('JHN', 3, 16));
    expect(() => theoVerseId('4303016')).toThrow();
    const ids = [verseId('GEN', 1, 1), verseId('GEN', 1, 2), verseId('GEN', 1, 3), verseId('GEN', 1, 5), verseId('GEN', 1, 2)];
    expect(compressVerseIds(ids)).toEqual(['GEN.1.1-3', 'GEN.1.5']);
    // Runs continue across a chapter break (1 Kgs 11 has 43 verses) but not across books.
    expect(compressVerseIds([verseId('1KI', 11, 43), verseId('1KI', 12, 1), verseId('1KI', 12, 2)])).toEqual(['1KI.11.43-12.2']);
    expect(compressVerseIds([verseId('MAL', 4, 6), verseId('MAT', 1, 1)])).toEqual(['MAL.4.6', 'MAT.1.1']);
  });
});

describe("Easton's text", () => {
  it('reads link targets, including chapter-only and malformed ones', () => {
    expect(dictLinkRef('/2sam#2Sam.17.25')).toBe('2SA.17.25');
    expect(dictLinkRef('/ps#Ps.52')).toBe('PSA.52');
    expect(dictLinkRef('1chr/#1Chr.8.12')).toBe('1CH.8.12');
    expect(dictLinkRef('/x#Tob.1.1')).toBeNull();
  });

  it('turns Markdown verse links into ref links and splits paragraphs', () => {
    // From david_994 dictText.
    const md =
      'Beloved, the eighth and youngest son of Jesse. Some think she was the Nahash of [2 Sam. 17:25](/2sam#2Sam.17.25). He was red-haired ([1 Sam. 16:12](/1sam#1Sam.16.12); [17:42](/1sam#1Sam.17.42)).\n\n Samuel paid an unexpected visit ([1 Sam. 16:1-13](/1sam#1Sam.16.1)). Comp. [Ps. 52](/ps#Ps.52). The lion and the bear ([1 Sam. 17:34](/1sam#1Sam.17.34), [35](/1sam#1Sam.17.35)); see also John 3:16.';
    const blocks = dictToBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].k).toBe('p');
    const refs = blocks.flatMap((b) => b.c.flatMap((c) => (typeof c !== 'string' && c.ref ? [`${c.t}=${c.ref}`] : [])));
    expect(refs).toEqual([
      '2 Sam. 17:25=2SA.17.25',
      '1 Sam. 16:12=1SA.16.12',
      '17:42=1SA.17.42',
      '1 Sam. 16:1-13=1SA.16.1-13',
      'Ps. 52=PSA.52',
      '1 Sam. 17:34=1SA.17.34',
      '35=1SA.17.35',
      'John 3:16=JHN.3.16',
    ]);
    const text = blocks.map((b) => b.c.map((c) => (typeof c === 'string' ? c : c.t)).join('')).join('\n');
    expect(text).not.toMatch(/[[\]()]\//);
    expect(text.startsWith('Beloved, the eighth')).toBe(true);
  });

  it('unlinks refs to verses that do not exist', () => {
    // jehoiada_793: "[23:24](/2chr#2Chr.23.24)" (Easton wrote chapters 23 and 24).
    const blocks = dictToBlocks('described in [2 Chr. 22:11](/2chr#2Chr.22.11); [23:24](/2chr#2Chr.23.24).');
    const { blocks: out, dropped } = dropInvalidRefs(blocks, (r) => r !== '2CH.23.24');
    expect(dropped).toEqual(['2CH.23.24']);
    expect(out[0].c).toEqual(['described in ', { t: '2 Chr. 22:11', ref: '2CH.22.11' }, '; 23:24.']);
  });
});

describe('personTitle', () => {
  const base = { id: 'x', name: 'Abdi' };
  it("uses Theographic's displayTitle disambiguation for anyone", () => {
    expect(personTitle({ ...base, name: 'Abiel', displayTitle: 'Abiel (Arbathite)' }, false)).toEqual({ title: 'Arbathite', source: 'displayTitle' });
    expect(personTitle({ ...base, name: 'David', displayTitle: 'David' }, false)).toBeNull();
  });

  it('prefers family links for shared names', () => {
    expect(personTitle({ ...base, father: 'Jesse', disambiguation: 'Abdi (descendent of Elam)' }, true)).toEqual({ title: 'son of Jesse', source: 'parent' });
    expect(personTitle({ ...base, gender: 'F', mother: 'Leah' }, true)?.title).toBe('daughter of Leah');
    expect(personTitle({ ...base, child: 'Kishi' }, true)?.title).toBe('father of Kishi');
    expect(personTitle({ ...base, gender: 'F', partner: 'Lamech' }, true)?.title).toBe('wife of Lamech');
    expect(personTitle({ ...base, sibling: 'Eliab' }, true)?.title).toBe('brother of Eliab');
  });

  it('falls back to usable disambiguation notes', () => {
    expect(personTitle({ ...base, disambiguation: 'Abdi (descendent of Elam)' }, true)).toEqual({ title: 'descendent of Elam', source: 'note' });
    expect(personTitle({ ...base, name: 'Bunni', disambiguation: 'Bunni (building me)' }, true)).toBeNull();
    expect(personTitle({ ...base, disambiguation: 'Abdi (descendent of Elam)' }, false)).toBeNull();
  });

  it('rejects name meanings, bare names and fragments as notes', () => {
    for (const ok of ['the Hittite', 'Mighty Man of David', 'sealed the covenant', 'a Tishbite who was an inhabitant of Gilead', "Rebekah's nurse"])
      expect(usableNote(ok)).toBe(true);
    for (const bad of ['aided by Jehovah', 'building me', 'Shema', '454 years old', 'The Lord has remembered', 'citadel'])
      expect(usableNote(bad)).toBe(false);
  });
});

describe('matchPlace', () => {
  const cand = (id: string, name: string, verses: number[], names: string[] = []) => ({ id, name, names: new Set(names), verses: new Set(verses) });
  const galilee1 = cand('galilee-1', 'galilee', [1, 2, 3, 4]);
  const galilee2 = cand('galilee-2', 'galilee', [5, 6]);
  const kittim = cand('kittim', 'kittim', [7], ['cyprus']);

  it('picks the same-name place with the most shared verses', () => {
    expect(matchPlace(['Galilee'], [1, 2, 3], [galilee1, galilee2, kittim])?.id).toBe('galilee-1');
    expect(matchPlace(['Galilee'], [5, 6, 9], [galilee1, galilee2, kittim])?.id).toBe('galilee-2');
  });

  it('falls back to translation spellings, and refuses weak or tied matches', () => {
    expect(matchPlace(['Cyprus'], [7], [galilee1, kittim])?.id).toBe('kittim');
    expect(matchPlace(['Galilee'], [1, 9, 10], [galilee1, galilee2])).toBeNull();
    expect(matchPlace(['Galilee'], [1, 5], [galilee1, galilee2])).toBeNull();
    expect(matchPlace(['Eden'], [1], [galilee1])).toBeNull();
  });
});
