import { describe, expect, it } from 'vitest';

import {
  dictBook,
  expandPassage,
  homeBook,
  isValidCompact,
  lastBookInProse,
  linkMarkup,
  parseRefWithBook,
  readRefText,
  resolveTagged,
  splitRefList,
} from './dict-refs';
import { toCompact } from '../../../src/lib/bible/refs';

const compact = (s: string) => {
  const r = parseRefWithBook(s);
  return r ? toCompact(r) : null;
};
/** Compact refs and their texts in linked markup. */
const links = (html: string) => [...html.matchAll(/<ref c="([^"]+)">([^<]*)<\/ref>/g)].map((m) => `${m[1]}=${m[2]}`);

describe('parseRefWithBook', () => {
  it('reads dictionary abbreviations', () => {
    expect(compact('Ex. 6:20')).toBe('EXO.6.20');
    expect(compact('1 Chr. 2:10')).toBe('1CH.2.10');
    expect(compact('Ps. 31')).toBe('PSA.31'); // refs.ts parseReference reads this as Psalm 1
    expect(compact('Lev. 8')).toBe('LEV.8'); // …and this as Leviticus 1
    expect(compact('Isa. 8:2')).toBe('ISA.8.2');
    expect(compact('II Kings 3:4')).toBe('2KI.3.4');
    expect(compact('Matt. 5-7')).toBe('MAT.5.1-7.29');
    expect(compact('Acts 16:10-17:15')).toBe('ACT.16.10-17.15');
    expect(compact('Jude 3')).toBe('JUD.1.3');
    expect(compact('nu 26:59')).toBe('NUM.26.59');
    expect(compact('Nu 26:5 ff;')).toBe('NUM.26.5');
  });
  it('reads "Jud" as Judges, as the dictionaries do', () => {
    expect(dictBook('Jud')).toBe('JDG');
    expect(compact('Jud 1:12')).toBe('JDG.1.12');
    expect(compact('Jude 1:9')).toBe('JUD.1.9');
  });
  it('rejects the Apocrypha and verses outside the KJV versification', () => {
    expect(compact('1 Macc. 1:57')).toBeNull();
    expect(compact('Jer. 38:60')).toBeNull();
    expect(compact('Exodus 1491')).toBeNull();
  });
});

describe('readRefText / resolveTagged', () => {
  const exod4 = { book: 'EXO' as const, chapter: 4, verse: true };
  it('reads partial refs through the context', () => {
    expect(readRefText('27-30', exod4, ',').refs.map(toCompact)).toEqual(['EXO.4.27-30', 'EXO.27.1-30.38']);
    expect(readRefText('7:7', exod4).refs.map(toCompact)).toEqual(['EXO.7.7']);
    // After ";" a bare number is a chapter ("Lev. 8; 9"), after "," a verse ("Lev. 10:1,2").
    expect(readRefText('9', { book: 'LEV', chapter: 8, verse: false }, '; ').refs.map(toCompact)[0]).toBe('LEV.9');
    expect(readRefText('2', { book: 'LEV', chapter: 10, verse: true }, ',').refs.map(toCompact)[0]).toBe('LEV.10.2');
  });
  it('replaces an osisRef that disagrees with its text (Easton AARON "Ex. 4:14,27-30")', () => {
    const r = resolveTagged({ ref: 'GEN.1.27-30' }, '27-30', exod4, ',');
    expect(r).toMatchObject({ ref: 'EXO.4.27-30', status: 'fixed' });
  });
  it('keeps an agreeing osisRef and the chapter form of the text', () => {
    expect(resolveTagged({ ref: 'EXO.6.20' }, 'Ex. 6:20', null)).toMatchObject({ ref: 'EXO.6.20', status: 'ok' });
    expect(resolveTagged({ ref: 'LEV.8.1-36' }, 'Lev. 8', null)).toMatchObject({ ref: 'LEV.8', status: 'ok' });
  });
  it('keeps a ThML passage that names its book when trusted (Smith "de 9:20" shown as "9:20")', () => {
    expect(resolveTagged({ ref: 'DEU.9.20' }, '9:20', exod4, '; ', true)).toMatchObject({ ref: 'DEU.9.20', status: 'kept' });
  });
  it('drops refs to books outside the 66', () => {
    expect(resolveTagged({ ref: 'GEN.5.23' }, '1 Macc. 1:23', null)).toMatchObject({ ref: null, status: 'dropped', unknownBook: true });
  });
});

describe('lists', () => {
  it('splits and expands passage lists', () => {
    expect(splitRefList('33:47,48; 34:2')).toEqual(['33:47', ',', '48', '; ', '34:2']);
    expect(expandPassage('nu 33:47,48')).toEqual([{ ref: 'NUM.33.47' }, { ref: 'NUM.33.48' }]);
    expect(expandPassage('re 22;13')).toEqual([{ ref: 'REV.22.13' }]);
  });
});

describe('linkMarkup', () => {
  it('links the Easton AARON paragraph (module text)', () => {
    const tei =
      '<p>The eldest son of Amram and Jochebed, a daughter of Levi (<ref osisRef="Bible:Exod.6.20">Ex. 6:20</ref>). He was born in Egypt three years before his brother Moses, and a number of years after his sister Miriam (2:1,4; 7:7). He married Elisheba, the daughter of Amminadab of the house of Judah (6:23; <ref osisRef="Bible:1Chr.2.10">1 Chr. 2:10</ref>), by whom he had four sons. When the time for the deliverance of Isarael out of Egypt drew nigh, he was sent by God (<ref osisRef="Bible:Exod.4.14">Ex. 4:14</ref>,<ref osisRef="Bible:Gen.1.27-Gen.1.30">27-30</ref>) to meet his long-absent brother. (See <ref target="Easton:MOSES">MOSES</ref>.)</p>';
    const { html, stats } = linkMarkup(tei, { target: (t) => (t === 'Easton:MOSES' ? { href: '/study/dictionary/easton/moses' } : null) });
    expect(links(html)).toEqual([
      'EXO.6.20=Ex. 6:20', 'EXO.2.1=2:1', 'EXO.2.4=4', 'EXO.7.7=7:7', 'EXO.6.23=6:23', '1CH.2.10=1 Chr. 2:10', 'EXO.4.14=Ex. 4:14', 'EXO.4.27-30=27-30',
    ]);
    expect(html).toContain('<ref h="/study/dictionary/easton/moses">MOSES</ref>');
    expect(stats).toMatchObject({ ok: 3, fixed: 1, context: 4 });
  });

  it('repairs Nave one-chapter-book refs and split book numbers (module text)', () => {
    const nave =
      '<lb/>→ OF MAN FOR GOD <ref osisRef="1John.5.1-1John.5.3">5:1-3</ref>; <ref osisRef="2John.1.1">2Jo 1</ref>:6; <ref osisRef="Jude.1.1">Jude 1</ref>:21\n<lb/>5. Son of <ref osisRef="Mic.2">Micah 2</ref>Ch 34:20\n<list>';
    const { html, stats } = linkMarkup(nave);
    expect(links(html)).toEqual(['1JN.5.1-3=5:1-3', '2JN.1.6=2Jo 1:6', 'JUD.1.21=Jude 1:21', '2CH.34.20=2Ch 34:20']);
    expect(html).toContain('5. Son of Micah <ref');
    expect(stats.repaired).toBe(3);
  });

  it('expands ThML passage lists and keeps passages that name their book (Smith)', () => {
    const thml = '(<scripRef passage="ex 7:19">Exodus 7:19</scripRef>) … (<scripRef passage="de 9:20">9:20</scripRef>) … (<scripRef passage="nu 33:47,48">33:47,48</scripRef>)';
    const { html } = linkMarkup(thml, { trustAttr: true });
    expect(links(html)).toEqual(['EXO.7.19=Exodus 7:19', 'DEU.9.20=9:20', 'NUM.33.47=33:47', 'NUM.33.48=48']);
  });

  it('drops Apocrypha refs and their continuations', () => {
    const { html, stats } = linkMarkup('(<ref osisRef="Bible:Gen.5.23">1 Macc. 1:23; 4:49</ref>)');
    expect(links(html)).toEqual([]);
    expect(stats.dropped).toBe(2);
  });

  it('links bare refs to the book named just before them', () => {
    const { html } = linkMarkup('<p>Benhadad (<ref osisRef="Bible:2Kgs.13.3">2 Kings 13:3</ref>). His misfortunes in war are noticed by Amos (1:4).</p>');
    expect(links(html)).toEqual(['2KI.13.3=2 Kings 13:3', 'AMO.1.4=1:4']);
    const other = linkMarkup('<p>(<ref osisRef="Bible:Gen.1.1">Gen. 1:1</ref>). So Greek Baruch (3:6).</p>');
    expect(links(other.html)).toEqual(['GEN.1.1=Gen. 1:1']);
  });
});

describe('helpers', () => {
  it('validates compact refs against the KJV versification', () => {
    expect(isValidCompact('JHN.3.16')).toBe(true);
    expect(isValidCompact('ROM.8.28-30')).toBe(true);
    expect(isValidCompact('GEN.1.32')).toBe(false);
    expect(isValidCompact('PHM.3.21')).toBe(false);
  });
  it('finds the book an entry is about and books named in prose', () => {
    expect(homeBook('ROMANS, EPISTLE TO THE')).toBe('ROM');
    expect(homeBook('CORINTHIANS, FIRST EPISTLE TO THE')).toBe('1CO');
    expect(homeBook('MARK, GOSPEL ACCORDING TO')).toBe('MRK');
    expect(homeBook('MARK')).toBeNull();
    expect(lastBookInProse('It was intended primarily for Romans. Deuteronomy emphasizes')).toBe('DEU');
    expect(lastBookInProse('It was intended primarily for Romans.')).toBeNull();
  });
});
