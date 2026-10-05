import { describe, expect, it } from 'vitest';

import { EDGE_TRAVEL, EDGE_ZONE, edgeSwipe, startsAtEdge } from './edge';

describe('edge swipes', () => {
  it('start only in the strip along their own edge', () => {
    expect(startsAtEdge('left', 0, 400)).toBe(true);
    expect(startsAtEdge('left', EDGE_ZONE, 400)).toBe(true);
    expect(startsAtEdge('left', EDGE_ZONE + 1, 400)).toBe(false);
    expect(startsAtEdge('right', 399, 400)).toBe(true);
    expect(startsAtEdge('right', 400 - EDGE_ZONE, 400)).toBe(true);
    expect(startsAtEdge('right', 200, 400)).toBe(false);
    expect(startsAtEdge('left', 395, 400)).toBe(false);
  });

  it('open once the finger has moved far enough inward, mostly sideways', () => {
    const start = { x: 395, y: 500 };
    expect(edgeSwipe('right', start, { x: 395 - EDGE_TRAVEL + 1, y: 500 })).toBe('pending');
    expect(edgeSwipe('right', start, { x: 395 - EDGE_TRAVEL, y: 500 })).toBe('open');
    expect(edgeSwipe('right', start, { x: 355, y: 520 })).toBe('open');
    expect(edgeSwipe('left', { x: 4, y: 300 }, { x: 40, y: 290 })).toBe('open');
  });

  it('give way to scrolling and to swipes heading back out', () => {
    expect(edgeSwipe('right', { x: 395, y: 500 }, { x: 390, y: 470 })).toBe('cancel');
    expect(edgeSwipe('left', { x: 20, y: 300 }, { x: 5, y: 300 })).toBe('cancel');
    // Steep diagonals wait to see which way they go.
    expect(edgeSwipe('left', { x: 4, y: 300 }, { x: 34, y: 325 })).toBe('pending');
  });
});
