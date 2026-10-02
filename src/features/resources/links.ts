import { BOOK_CODES, type BookCode } from '@/lib/bible/books';

// Link-out URL patterns for study sites and featured teachers. Every pattern and every book slug was
// verified to resolve (see docs/DATA_SOURCES.md → External links); scripts/check-links.ts re-checks them.

const BLB = 'gen exo lev num deu jos jdg rth 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa jer lam eze dan hos joe amo oba jon mic nah hab zep hag zec mal mat mar luk jhn act rom 1co 2co gal eph phl col 1th 2th 1ti 2ti tit phm heb jas 1pe 2pe 1jo 2jo 3jo jde rev'.split(' ');

const BIBLEHUB = 'genesis exodus leviticus numbers deuteronomy joshua judges ruth 1_samuel 2_samuel 1_kings 2_kings 1_chronicles 2_chronicles ezra nehemiah esther job psalms proverbs ecclesiastes songs isaiah jeremiah lamentations ezekiel daniel hosea joel amos obadiah jonah micah nahum habakkuk zephaniah haggai zechariah malachi matthew mark luke john acts romans 1_corinthians 2_corinthians galatians ephesians philippians colossians 1_thessalonians 2_thessalonians 1_timothy 2_timothy titus philemon hebrews james 1_peter 2_peter 1_john 2_john 3_john jude revelation'.split(' ');

const OSIS = 'Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev'.split(' ');

/** Desiring God scripture-index slugs; Esther and Nahum have no index page. */
const DG = 'genesis exodus leviticus numbers deuteronomy joshua judges ruth 1-samuel 2-samuel 1-kings 2-kings 1-chronicles 2-chronicles ezra nehemiah - job psalms proverbs ecclesiastes song-of-solomon isaiah jeremiah lamentations ezekiel daniel hosea joel amos obadiah jonah micah - habakkuk zephaniah haggai zechariah malachi matthew mark luke john acts romans 1-corinthians 2-corinthians galatians ephesians philippians colossians 1-thessalonians 2-thessalonians 1-timothy 2-timothy titus philemon hebrews james 1-peter 2-peter 1-john 2-john 3-john jude revelation'.split(' ');

/** Bible Gateway needs full English book names. */
const NAMES = 'Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalm|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation'.split('|');

const idx = (book: BookCode) => BOOK_CODES.indexOf(book);

export const SITE = {
  blb: 'https://www.blueletterbible.org',
  biblehub: 'https://biblehub.com',
  step: 'https://www.stepbible.org',
  gateway: 'https://www.biblegateway.com',
  dg: 'https://www.desiringgod.org',
  gty: 'https://www.gty.org',
  heartcry: 'https://www.heartcrymissionary.com',
  sermonaudio: 'https://www.sermonaudio.com',
};

export const links = {
  blbVerse: (book: BookCode, ch: number, v?: number, tr: 'kjv' | 'asv' = 'kjv') => `${SITE.blb}/${tr}/${BLB[idx(book)]}/${ch}/${v ? `${v}/` : ''}`,
  blbInterlinear: (book: BookCode, ch: number, v: number, testament: 'OT' | 'NT') =>
    `${SITE.blb}/tools/interlinear/${testament === 'NT' ? 'tr' : 'wlc'}/${BLB[idx(book)]}/${ch}/${v}/`,
  blbLexicon: (strongs: string) => {
    const m = /^([GH])(\d+)/.exec(strongs);
    if (!m) return null;
    const n = Number(m[2]);
    if (m[1] === 'G' ? n < 1 || n > 5624 : n < 1 || n > 8674) return null;
    return `${SITE.blb}/lexicon/${m[1].toLowerCase()}${n}/kjv/${m[1] === 'G' ? 'tr' : 'wlc'}/0-1/`;
  },
  bibleHubVerse: (book: BookCode, ch: number, v: number) => `${SITE.biblehub}/${BIBLEHUB[idx(book)]}/${ch}-${v}.htm`,
  bibleHubInterlinear: (book: BookCode, ch: number, v: number) => `${SITE.biblehub}/interlinear/${BIBLEHUB[idx(book)]}/${ch}-${v}.htm`,
  bibleHubStrongs: (strongs: string) => {
    const m = /^([GH])(\d+)/.exec(strongs);
    if (!m) return null;
    return `${SITE.biblehub}/${m[1] === 'G' ? 'greek' : 'hebrew'}/${Number(m[2])}.htm`;
  },
  stepVerse: (book: BookCode, ch: number, v?: number) =>
    `${SITE.step}/?q=version=KJV%7Creference=${OSIS[idx(book)]}.${ch}${v ? `.${v}` : ''}`,
  bibleGateway: (book: BookCode, ch: number, v?: number, tr: 'kjv' | 'asv' = 'kjv') =>
    `${SITE.gateway}/passage/?search=${encodeURIComponent(`${NAMES[idx(book)]} ${ch}${v ? `:${v}` : ''}`)}&version=${tr.toUpperCase()}`,
  /** Desiring God resources on a chapter (no verse-level pages exist). Null for Esther and Nahum. */
  dgChapter: (book: BookCode, ch: number) => (DG[idx(book)] === '-' ? null : `${SITE.dg}/scripture/${DG[idx(book)]}/${ch}`),
  /** Grace to You's sermon archive by Scripture (its book/chapter filter can't be linked directly). */
  gtyScripture: () => `${SITE.gty}/sermons/archive?tab=scripture`,
  /** Paul Washer sermons on a chapter, from HeartCry's official SermonAudio uploads. */
  heartcryChapter: (book: BookCode, ch: number) => `${SITE.sermonaudio}/broadcasters/heartcry/sermons?book=${book}&chapter=${ch}`,
  washerSpeaker: () => `${SITE.sermonaudio}/speakers/13197`,
};

/** Attribution lines required next to linked or embedded teaching (see docs/DATA_SOURCES.md). */
export const ATTRIBUTION = {
  piper: 'By John Piper. © Desiring God Foundation. Source: desiringGod.org',
  macarthur: 'John MacArthur, Grace to You. Copyright Grace to You. All rights reserved. gty.org',
  washer: 'Paul Washer, HeartCry Missionary Society. Copyright Paul Washer of HeartCry Missionary Society. All rights reserved. www.heartcrymissionary.com',
};

export const BOOK_TABLES = { BLB, BIBLEHUB, OSIS, DG, NAMES };
