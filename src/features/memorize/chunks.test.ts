import { describe, expect, it } from 'vitest';

import { chainSteps, chunkVerses, formatPart, isChapterLength, nextPart, parsePart, partSpan, resolvePart, type Span } from './chunks';

const sizes = (spans: Span[]) => spans.map((s) => s.end - s.start + 1);

function expectCovers(spans: Span[], n: number) {
  expect(spans[0].start).toBe(0);
  expect(spans[spans.length - 1].end).toBe(n - 1);
  for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBe(spans[i - 1].end + 1);
  for (const s of spans) expect(s.end).toBeGreaterThanOrEqual(s.start);
}

describe('chunking', () => {
  it('makes chunks of three verses when verses are even', () => {
    const spans = chunkVerses(Array(12).fill(20));
    expectCovers(spans, 12);
    expect(sizes(spans)).toEqual([3, 3, 3, 3]);
  });

  it('adjusts to verse length', () => {
    // Long verses in the middle make smaller chunks there.
    const spans = chunkVerses([15, 15, 15, 60, 60, 15, 15, 15]);
    expectCovers(spans, 8);
    expect(spans.some((s) => s.start === 3 && s.end === 3)).toBe(true);
    // Very short verses group into bigger chunks, but never more than five.
    const short = chunkVerses(Array(20).fill(4));
    expectCovers(short, 20);
    expect(Math.max(...sizes(short))).toBeLessThanOrEqual(5);
    expect(Math.max(...sizes(short))).toBeGreaterThan(3);
  });

  it('chunks Psalm 23 into two parts', () => {
    // KJV word counts of Psalm 23:1–6.
    const spans = chunkVerses([9, 15, 16, 31, 21, 25]);
    expectCovers(spans, 6);
    expect(spans).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]);
  });

  it('folds a short last chunk into the one before', () => {
    const spans = chunkVerses([20, 20, 20, 20, 20, 20, 5]);
    expectCovers(spans, 7);
    expect(sizes(spans)).toEqual([3, 4]);
  });

  it('handles tiny passages', () => {
    expect(chunkVerses([])).toEqual([]);
    expect(chunkVerses([10])).toEqual([{ start: 0, end: 0 }]);
  });
});

describe('chaining and parts', () => {
  it('chains verse 1, then 1–2, then 1–3', () => {
    expect(chainSteps(3)).toEqual([
      { start: 0, end: 0 },
      { start: 0, end: 1 },
      { start: 0, end: 2 },
    ]);
  });

  it('parses and formats parts', () => {
    expect(parsePart('chunk-2')).toEqual({ kind: 'chunk', index: 1 });
    expect(parsePart('chain-3')).toEqual({ kind: 'chain', index: 2 });
    expect(parsePart('all')).toEqual({ kind: 'all' });
    expect(parsePart('chunk-0')).toBeNull();
    expect(parsePart('nope')).toBeNull();
    expect(parsePart(undefined)).toBeNull();
    expect(formatPart({ kind: 'chain', index: 0 })).toBe('chain-1');
  });

  it('selects spans and steps forward', () => {
    const chunks = [
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ];
    expect(partSpan({ kind: 'chunk', index: 1 }, chunks, 6)).toEqual({ start: 3, end: 5 });
    expect(partSpan({ kind: 'chunk', index: 5 }, chunks, 6)).toBeNull();
    expect(partSpan({ kind: 'chain', index: 3 }, chunks, 6)).toEqual({ start: 0, end: 3 });
    expect(partSpan({ kind: 'all' }, chunks, 6)).toEqual({ start: 0, end: 5 });
    expect(nextPart({ kind: 'chunk', index: 0 }, 2, 6)).toEqual({ kind: 'chunk', index: 1 });
    expect(nextPart({ kind: 'chunk', index: 1 }, 2, 6)).toBeNull();
    expect(nextPart({ kind: 'chain', index: 4 }, 2, 6)).toEqual({ kind: 'chain', index: 5 });
    expect(nextPart({ kind: 'all' }, 2, 6)).toBeNull();
  });

  it('resolves the part from the URL, falling back to the first chunk', () => {
    const chunks = [
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ];
    expect(resolvePart(true, 'chunk-2', chunks, 6)).toEqual({ kind: 'chunk', index: 1 });
    expect(resolvePart(true, 'chunk-9', chunks, 6)).toEqual({ kind: 'chunk', index: 0 });
    expect(resolvePart(true, 'chain-6', chunks, 6)).toEqual({ kind: 'chain', index: 5 });
    expect(resolvePart(true, undefined, chunks, 6)).toEqual({ kind: 'chunk', index: 0 });
    expect(resolvePart(false, 'chunk-2', chunks, 6)).toEqual({ kind: 'all' });
  });

  it('turns on chapter mode for chapters and long passages', () => {
    expect(isChapterLength(true, 1)).toBe(true);
    expect(isChapterLength(false, 3)).toBe(false);
    expect(isChapterLength(false, 14)).toBe(true);
  });
});
