import { describe, expect, it } from 'vitest';

import { BOOK_CODES } from '@/lib/bible/books';

import { BOOK_TABLES, links } from './links';

describe('link-out patterns', () => {
  it('has a slug for every book on every site', () => {
    for (const table of Object.values(BOOK_TABLES)) expect(table).toHaveLength(66);
    expect(BOOK_TABLES.DG.filter((s) => s === '-')).toHaveLength(2);
  });

  it('builds verified Blue Letter Bible URLs', () => {
    expect(links.blbVerse('JHN', 3, 16)).toBe('https://www.blueletterbible.org/kjv/jhn/3/16/');
    expect(links.blbVerse('EZK', 37, 1, 'asv')).toBe('https://www.blueletterbible.org/asv/eze/37/1/');
    expect(links.blbVerse('JUD', 1)).toBe('https://www.blueletterbible.org/kjv/jde/1/');
    expect(links.blbInterlinear('ROM', 8, 28, 'NT')).toBe('https://www.blueletterbible.org/tools/interlinear/tr/rom/8/28/');
    expect(links.blbInterlinear('GEN', 1, 1, 'OT')).toBe('https://www.blueletterbible.org/tools/interlinear/wlc/gen/1/1/');
    expect(links.blbLexicon('G25')).toBe('https://www.blueletterbible.org/lexicon/g25/kjv/tr/0-1/');
    expect(links.blbLexicon('H430')).toBe('https://www.blueletterbible.org/lexicon/h430/kjv/wlc/0-1/');
    expect(links.blbLexicon('G6063')).toBeNull();
  });

  it('builds Bible Hub, STEP, and Bible Gateway URLs', () => {
    expect(links.bibleHubVerse('SNG', 2, 4)).toBe('https://biblehub.com/songs/2-4.htm');
    expect(links.bibleHubVerse('1SA', 17, 45)).toBe('https://biblehub.com/1_samuel/17-45.htm');
    expect(links.bibleHubStrongs('G25')).toBe('https://biblehub.com/greek/25.htm');
    expect(links.stepVerse('JHN', 3, 16)).toBe('https://www.stepbible.org/?q=version=KJV%7Creference=John.3.16');
    expect(links.bibleGateway('SNG', 2, 4)).toBe('https://www.biblegateway.com/passage/?search=Song%20of%20Solomon%202%3A4&version=KJV');
  });

  it('builds teacher URLs', () => {
    expect(links.dgChapter('1CO', 13)).toBe('https://www.desiringgod.org/scripture/1-corinthians/13');
    expect(links.dgChapter('EST', 4)).toBeNull();
    expect(links.heartcryChapter('ROM', 8)).toBe('https://www.sermonaudio.com/broadcasters/heartcry/sermons?book=ROM&chapter=8');
  });

  it('covers every book code', () => {
    for (const b of BOOK_CODES) expect(links.blbVerse(b, 1, 1)).toMatch(/^https:\/\/www\.blueletterbible\.org\/kjv\/[0-9a-z]{3}\/1\/1\/$/);
  });
});
