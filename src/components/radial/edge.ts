// Edge swipes: on touch screens the corner dots are hidden, and a swipe in from the left or right
// edge opens that side's corner menu. Pure functions, unit-tested.

import type { Point } from './geometry';

export type EdgeSide = 'left' | 'right';

/**
 * How far in from the screen edge a swipe may start (px). Wider than the phone's own back-gesture
 * strip, so a swipe that starts just inside it still opens the menu.
 */
export const EDGE_ZONE = 32;
/** How far inward a swipe travels before the menu opens (px). */
export const EDGE_TRAVEL = 28;
/** Vertical movement past this, before the swipe is clearly sideways, makes it a scroll (px). */
const SLOP_Y = 16;

export function startsAtEdge(side: EdgeSide, x: number, width: number): boolean {
  return side === 'left' ? x <= EDGE_ZONE : x >= width - EDGE_ZONE;
}

/**
 * Where a swipe that started at the edge stands: 'open' once it has moved far enough inward and
 * mostly sideways; 'cancel' when it turns out to be a scroll or heads back out; else 'pending'.
 */
export function edgeSwipe(side: EdgeSide, start: Point, p: Point): 'pending' | 'open' | 'cancel' {
  const dx = side === 'left' ? p.x - start.x : start.x - p.x;
  const dy = Math.abs(p.y - start.y);
  if (dx >= EDGE_TRAVEL && dx >= dy * 1.4) return 'open';
  if ((dy > SLOP_Y && dy > dx) || dx < -12) return 'cancel';
  return 'pending';
}
