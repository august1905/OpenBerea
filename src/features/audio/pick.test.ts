import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BOOKS } from '@/lib/bible/books';
import type { AudioIndex } from '@/lib/data/types';

import { filesForChapter } from './pick';

const path = join(__dirname, '..', '..', '..', 'public', 'data', 'librivox', 'kjv.json');
const has = (() => {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!has)('audio index', () => {
  const index = JSON.parse(readFileSync(path, 'utf8')) as AudioIndex;
  it('has a recording for every chapter of every book', () => {
    for (const b of BOOKS) for (let c = 1; c <= b.chapters; c++) expect(filesForChapter(index[b.code], c).length, `${b.code} ${c}`).toBeGreaterThan(0);
  });
  it('finds multi-chapter files and split chapters', () => {
    const gen3 = filesForChapter(index.GEN, 3);
    expect(gen3[0].from).toBeLessThanOrEqual(3);
    expect(gen3[0].to).toBeGreaterThanOrEqual(3);
    expect(filesForChapter(index.PSA, 40).length).toBe(2);
  });
});
