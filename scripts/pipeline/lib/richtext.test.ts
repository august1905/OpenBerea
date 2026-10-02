import { describe, expect, it } from 'vitest';

import { blocksToText, decodeEntities, htmlToBlocks, linkRefs, tagScripts, textToBlocks } from './richtext';

describe('linkRefs', () => {
  it('links references in prose, including continuations', () => {
    const out = linkRefs('He was called (Gen. 12:1; 15:6, 8) and believed. See also John 3:16-18.');
    const refs = out.filter((x) => typeof x !== 'string' && x.ref).map((x) => (x as { ref: string }).ref);
    expect(refs).toEqual(['GEN.12.1', 'GEN.15.6', 'GEN.15.8', 'JHN.3.16-18']);
    const text = out.map((x) => (typeof x === 'string' ? x : x.t)).join('');
    expect(text).toBe('He was called (Gen. 12:1; 15:6, 8) and believed. See also John 3:16-18.');
  });

  it('handles numbered books and roman numerals', () => {
    const refs = linkRefs('1 Sam. 17:45 and II Kings 2:11 and Song of Solomon 2:4')
      .filter((x) => typeof x !== 'string' && x.ref)
      .map((x) => (x as { ref: string }).ref);
    expect(refs).toEqual(['1SA.17.45', '2KI.2.11', 'SNG.2.4']);
  });

  it('ignores things that are not references', () => {
    const out = linkRefs('In chapter 3:4 of the book, Vol 2:3, and verse 12:1.');
    expect(out.every((x) => typeof x === 'string' || !x.ref)).toBe(true);
    const bad = linkRefs('John 99:1');
    expect(bad.every((x) => typeof x === 'string' || !x.ref)).toBe(true);
  });
});

describe('htmlToBlocks', () => {
  it('splits paragraphs and keeps inline marks', () => {
    const blocks = htmlToBlocks('<p>Love, <i>agape</i>, is <b>great</b>.</p><p>Second &amp; last</p>');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].c).toEqual(['Love, ', { t: 'agape', i: 1 }, ', is ', { t: 'great', b: 1 }, '.']);
    expect(blocksToText(blocks)).toBe('Love, agape, is great.\nSecond & last');
  });

  it('uses converters for reference and Strong\'s attributes', () => {
    const blocks = htmlToBlocks('<p>From <a href="G25">G25</a>; see <ref osisRef="John.3.16">Jn 3:16</ref>.</p>', {
      strongsAttr: (a) => (/^[GH]\d+$/.test(a.href ?? '') ? a.href : null),
      refAttr: (a) => (a.osisref === 'John.3.16' ? 'JHN.3.16' : null),
    });
    expect(blocks[0].c).toEqual(['From ', { t: 'G25', s: 'G25' }, '; see ', { t: 'Jn 3:16', ref: 'JHN.3.16' }, '.']);
  });

  it('drops notes and handles lists', () => {
    const blocks = htmlToBlocks('<ul><li>One</li><li>Two<note>hidden</note></li></ul>');
    expect(blocks.map((b) => [b.k, b.d, blocksToText([b])])).toEqual([
      ['li', 0, 'One'],
      ['li', 0, 'Two'],
    ]);
  });

  it('tags Hebrew and Greek runs', () => {
    expect(tagScripts('word ἀγάπη love')).toEqual(['word ', { t: 'ἀγάπη', l: 'grc' }, ' love']);
    expect(tagScripts('אֱלֹהִים God')).toEqual([{ t: 'אֱלֹהִים', l: 'hbo' }, ' God']);
  });
});

describe('text helpers', () => {
  it('decodes entities', () => {
    expect(decodeEntities('&lt;a&gt; &#233; &#x3b1; &mdash;')).toBe('<a> é α —');
  });

  it('turns plain text into linked paragraphs', () => {
    const blocks = textToBlocks('First line about Rom 8:28.\n\nSecond.');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].c[1]).toEqual({ t: 'Rom 8:28', ref: 'ROM.8.28' });
  });
});
