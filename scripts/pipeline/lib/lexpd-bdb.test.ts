import { describe, expect, it } from 'vitest';

import type { Inline } from '../../../src/lib/data/types';
import {
  citedVerse,
  expandStrongs,
  headingBlock,
  headword,
  isMiscodedJoel,
  isStub,
  keyEvidence,
  mentionsLemma,
  normalizeArticleHtml,
  paragraphBlocks,
  parseArticle,
  parseDataRef,
  resolveCrossRef,
  skeleton,
  type InlineContext,
} from './lexpd-bdb';
import { blocksToText } from './richtext';

// Samples copied from BibleAquifer/BDBHebrewLexicon at commit 09fbdf3 (eng/json/001.content.json),
// shortened where marked "…".
const BDB00003 =
  '<style> body { margin: 0; } </style> <p class="p"><span class="hebrew">אבב</span> (<i>fresh, bright</i>, <abbr data-bdb="ABBR.17">As.</abbr> <i>abâbu</i> Dl<sup>w</sup>, AGl.)</p> ' +
  '<blockquote><p class="p"><abbr>[Str<span class="strongs-number">3</span>]</abbr> † [<span class="hebrew">אֵב</span>] <b>n. [m.]</b> freshness, fresh green (<abbr data-bdb="ABBR.365">Lag<sup>BN</sup></abbr> 207 Inf. <i>ibb;</i> thence concr., cf. <abbr data-bdb="ABBR.454">Ar.</abbr> <span class="arabic">أَبٌّ</span>; …) <span class="hebrew">עֹדֶנּוּ בְאִבּוֺ</span> <i>while yet in its freshness</i> (i.e. <span class="hebrew">אָחוּ</span>, reed) <data class="bible-ref" data-start-ref="18008012" data-end-ref="18008012">Jb 8:12</data>; concr., <abbr data-bdb="ABBR.505">pl.</abbr> <i>green shoots</i> <span class="hebrew">בְּאִבֵּי הַנַּחַל</span> <abbr data-bdb="ABBR.121">Ct</abbr> <data class="bible-ref" data-start-ref="22006011" data-end-ref="22006011">6:11</data>.</p></blockquote> ' +
  '<blockquote><p class="p"><abbr>[Str<span class="strongs-number">26</span>]</abbr> <span class="hebrew">אֲבִגַיִל</span> v. <span class="hebrew">אֲבִיגַיִל</span> sub II. <data class="resource-ref" data-content-id="BDB00018" data-resource-code="BDBHebrewLexicon"><span class="hebrew">אבה</span></data></p></blockquote>';

// From BDB00018 (II. אבה): the end of the אָב entry and its Addenda paragraph.
const ADDENDA =
  '<blockquote><p class="p"><abbr>[Str<span class="strongs-number">1</span>]</abbr> <span class="hebrew">אָב</span>:1191 <b>n.m.</b> father … (cf. <abbr data-bdb="ABBR.182">Ew<sup>§</sup></abbr> 273 b).</p> ' +
  '<p class="addenda"><p class="p">Page 3:b. <span class="hebrew">אָב</span> <b>9:</b> see also <abbr data-bdb="ABBR.181">Ew<sup>Gesch</sup></abbr>. i. 524.</p></blockquote> ' +
  '<blockquote><p class="p"><span class="hebrew">אָבִי</span> v. <span class="hebrew">ביה</span>.</p></blockquote>';

// BDB01310: II. יִבְנְיָה was left outside any paragraph; BDB02065 has a stray tag and page number.
const MALFORMED =
  '<blockquote><p class="p"><abbr>[Str<span class="strongs-number">2997</span>]</abbr> † I. <span class="hebrew">יִבְנְיָה</span> <b>n.pr.m.</b> a Benjamite.</p> <abbr>[Str<span class="strongs-number">2998</span>]</abbr> † II. <span class="hebrew">יִבְנְיָה</span> <b>n.pr.m.</b> a Benjamite.</blockquote> ' +
  '<p class="p"><esp. as="" grouppage="">188<abbr>[Str<span class="strongs-number">1740</span>]</abbr> † [<span class="hebrew">דּוּחַ</span>, <span class="hebrew">דִּיחַ</span>] <b>vb.</b> rinse</p>';

const article = (content: string, id = 'BDB00003') => ({ content_id: id, title: 'אבב', content });

/** Context that links every ref to "X.<code>" and every cross-ref to H999, recording the calls. */
function stubContext() {
  const calls: string[] = [];
  const ctx: InlineContext = {
    bibleRef: (start, _end, text) => {
      calls.push(`${start}:${text}`);
      return `GEN.1.${Number(start.slice(5))}`;
    },
    chapterRef: () => null,
    crossRef: (id, text) => (id === 'BDB00018' && text === 'אבה' ? 'H999' : null),
  };
  return { ctx, calls };
}

const marked = (inlines: Inline[], key: 'ref' | 's' | 'l') =>
  inlines.filter((c): c is Exclude<Inline, string> => typeof c !== 'string' && !!c[key]);

describe('Strong\'s markers', () => {
  it('expands lists, abbreviated ranges and misread digits', () => {
    expect(expandStrongs('6, 8').nums).toEqual([6, 8]);
    expect(expandStrongs('168–69').nums).toEqual([168, 169]);
    expect(expandStrongs('866,868–69').nums).toEqual([866, 868, 869]);
    expect(expandStrongs('3588+5921+3651').nums).toEqual([3588, 5921, 3651]);
    expect(expandStrongs('3068,3097, etc')).toEqual({ nums: [3068, 3097], irregular: [] });
    expect(expandStrongs('150,187l').nums).toEqual([150, 1871]);
    expect(expandStrongs('3588,3588+,518').nums).toEqual([3588, 518]);
  });

  it('reports reversed, wide and out-of-range parts', () => {
    expect(expandStrongs('4106–04')).toEqual({ nums: [], irregular: ['4106–04'] });
    expect(expandStrongs('6984–7029')).toEqual({ nums: [6984, 7029], irregular: ['6984–7029'] });
    expect(expandStrongs('8751').nums).toEqual([]);
  });
});

describe('articles', () => {
  it('splits an article into keyed entries and skips the root paragraph', () => {
    const parsed = parseArticle(article(BDB00003));
    expect(parsed.entries.map((e) => e.nums)).toEqual([[3], [26]]);
    expect(parsed.unkeyed).toBe(1);
    expect(headword(parsed.entries[0])).toBe('אֵב');
    expect(parsed.entries[0].paras[0]).toMatch(/^† \[<span class="hebrew">אֵב/);
    expect(isStub(parsed.entries[0])).toBe(false);
    expect(isStub(parsed.entries[1])).toBe(true);
  });

  it('attaches Addenda paragraphs to the entry they follow', () => {
    const parsed = parseArticle(article(ADDENDA, 'BDB00018'));
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].paras).toHaveLength(2);
    expect(parsed.entries[0].paras[1]).toMatch(/^Page 3:b\./);
    expect(parsed.unkeyed).toBe(1);
  });

  it('repairs the malformed spots of the digitization', () => {
    expect(normalizeArticleHtml(MALFORMED)).not.toMatch(/<esp\./);
    const parsed = parseArticle(article(MALFORMED, 'BDB01310'));
    expect(parsed.entries.map((e) => e.nums)).toEqual([[2997], [2998], [1740]]);
    expect(parsed.entries[1].paras[0]).toMatch(/^† II\./);
    expect(headword(parsed.entries[2])).toBe('דּוּחַ');
  });
});

describe('paragraph conversion', () => {
  it('keeps Hebrew, italics, superscripts and links refs and cross-references', () => {
    const [e3, e26] = parseArticle(article(BDB00003)).entries;
    const { ctx, calls } = stubContext();
    const blocks = paragraphBlocks(e3.paras[0], ctx);
    expect(blocks).toHaveLength(1);
    const c = blocks[0].c;
    expect(c[0]).toBe('† [');
    expect(c[1]).toEqual({ t: 'אֵב', l: 'hbo' });
    expect(c).toContainEqual({ t: 'n. [m.]', b: 1 });
    expect(c).toContainEqual({ t: 'BN', sup: 1 });
    expect(c).toContainEqual({ t: 'while yet in its freshness', i: 1 });
    expect(marked(c, 'ref').map((r) => r.t)).toEqual(['Jb 8:12', '6:11']);
    expect(calls).toEqual(['18008012:Jb 8:12', '22006011:6:11']);
    expect(blocksToText(blocks)).toContain('cf. Ar. أَبٌّ;');
    const stub = paragraphBlocks(e26.paras[0], ctx)[0].c;
    expect(marked(stub, 's')).toEqual([{ t: 'אבה', l: 'hbo', s: 'H999' }]);
  });

  it('starts a new block at bold sense numbers and stems, not at other bold text', () => {
    const html =
      '† I. <span class="hebrew">בָּרָא</span>:53 <b>vb.</b> shape, create—<b>Qal</b> <i>Pf.</i> <data class="bible-ref" data-start-ref="01001001" data-end-ref="01001001">Gn 1:1</data>; <b>1.</b> obj. heaven and earth; <b>2.</b> the individual man; <b>a.</b> sub. <b>Niph.</b> be created';
    const { ctx } = stubContext();
    const text = paragraphBlocks(html, ctx).map((b) => blocksToText([b]));
    expect(text).toEqual([
      '† I. בָּרָא:53 vb. shape, create—',
      'Qal Pf. Gn 1:1;',
      '1. obj. heaven and earth;',
      '2. the individual man; a. sub.',
      'Niph. be created',
    ]);
  });

  it('builds a heading with all Strong\'s numbers of a shared entry', () => {
    expect(headingBlock('אָבַד', [6])).toEqual({ k: 'h', c: [{ t: 'אָבַד', l: 'hbo' }] });
    expect(headingBlock('אָבַד', [6, 8]).c).toEqual([
      { t: 'אָבַד', l: 'hbo' },
      ' (Strong’s ',
      { t: 'H6', s: 'H6' },
      ', ',
      { t: 'H8', s: 'H8' },
      ')',
    ]);
  });
});

describe('Strong\'s checks', () => {
  it('compares consonant skeletons', () => {
    expect(skeleton('אֱלֹהִים')).toBe('אלהימ');
    expect(keyEvidence(['אָבַד'], ['אֹבֵד'])).toBe('strong');
    expect(keyEvidence(['אֲבִגַיִל'], ['אֲבִיגַיִל'])).toBe('strong'); // plene vs defective
    expect(keyEvidence(['הָרָם'], ['בֵּית הָרָם'])).toBe('strong'); // compound name
    expect(keyEvidence(['מֹף'], ['נֹף, מֹף'])).toBe('strong'); // TBESH lemma with two forms
    // Only weak: the stage keeps a weak key only when the number has no closer entry (H430 has one).
    expect(keyEvidence(['הָלַל', 'הַלּוּל', 'הַלֵּל'], ['אֱלֹהִים'])).toBe('weak');
    expect(keyEvidence(['יהוה', 'יַהְוֶה', 'יְהוָֺה', 'אֲדֹנָי'], ['צָבָא'])).toBeNull();
    expect(keyEvidence(['תַּאֲנִיָּה'], ['תָּבוֹר'])).toBeNull(); // H8396 digit slip in the source
    expect(keyEvidence(['אַךְ'], ['אַח'])).toBe('weak'); // typo for אַח (Aramaic "brother")
    expect(mentionsLemma(['אֵשׁ', 'אשׁדת'], ['אֶשְׁדָּת'])).toBe(true);
  });

  it('resolves a cross-reference only to a unique single-number entry', () => {
    const targets = [
      { head: 'אָב', nums: [1] },
      { head: 'אֲבִיגַיִל', nums: [26] },
      { head: 'אָבַד', nums: [6, 8] },
    ];
    expect(resolveCrossRef(targets, 'אֲבִיגַ֫יִל')).toBe('H26');
    expect(resolveCrossRef(targets, 'אבד')).toBeNull();
    expect(resolveCrossRef(undefined, 'אב')).toBeNull();
  });
});

describe('refs', () => {
  it('takes chapter and verse from the printed text when it has them', () => {
    // Printed Hebrew numbers; the code holds the English number in this spot.
    expect(citedVerse('26021030', '26021030', '21:35')).toMatchObject({ numbering: 'hebrew', basis: 'display', chapter: 21, verse: 35 });
    expect(citedVerse('19051012', '19051012', 'Psalm 51:12')).toMatchObject({ chapter: 51, verse: 12 });
    expect(citedVerse('13009008', '13009008', '1 Ch 9:8a')).toMatchObject({ chapter: 9, verse: 8 });
    expect(citedVerse('01017007', '01017010', 'Gn 17:7–10')).toMatchObject({ chapter: 17, verse: 7, endChapter: 17, endVerse: 10 });
  });

  it('uses the code for a bare verse, in KJV numbers when it differs from the print', () => {
    expect(citedVerse('31001012', '31001012', '12')).toMatchObject({ numbering: 'hebrew', basis: 'code', chapter: 1, verse: 12 });
    // "Na 2:13 (‖ id. v:14": Hebrew 2:14, coded as KJV 2:13.
    expect(citedVerse('34002013', '34002013', '14')).toMatchObject({ numbering: 'kjv', basis: 'code-kjv', chapter: 2, verse: 13 });
  });

  it('recodes BDB\'s "Jo" (Joel) refs that the digitization coded as John', () => {
    expect(isMiscodedJoel(43, 'Jo 2:4', false)).toBe(true);
    expect(isMiscodedJoel(43, '4:7', true)).toBe(true);
    expect(isMiscodedJoel(43, 'John 11:54', false)).toBe(false);
    expect(isMiscodedJoel(29, 'Jo 2:4', false)).toBe(false);
  });

  it('parses ref attributes of unlinked spans', () => {
    expect(parseDataRef('Is 28')).toEqual({ abbr: 'Is', chapter: 28, verse: undefined });
    expect(parseDataRef('1Ma 11:32')).toEqual({ abbr: '1Ma', chapter: 11, verse: 32 });
    expect(parseDataRef('')).toBeNull();
  });
});
