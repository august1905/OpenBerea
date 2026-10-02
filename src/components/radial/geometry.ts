// Geometry for the corner quarter-radial (marking) menus. Pure functions, unit-tested.
//
// Angles are in degrees inside the quarter that opens toward the screen: 0° points along the bottom
// edge toward the middle of the screen, 90° points straight up. Distances are in px from the corner
// origin (the center of the corner dot).

export type Corner = 'bottom-right' | 'bottom-left';

export interface Point {
  x: number;
  y: number;
}

export interface Polar {
  angle: number;
  dist: number;
}

export interface RingLayout {
  /** Radius of each ring, innermost first. */
  radii: number[];
  /** Distance from each screen edge to the corner origin. */
  inset: number;
  /** Pixel spacing between neighboring items on an outer ring. */
  spacing: number;
}

export function layoutFor(width: number, height: number, variant: 'menu' | 'tabs'): RingLayout {
  const short = Math.min(width, height);
  const compact = short < 500;
  if (variant === 'tabs') {
    const r1 = compact ? 150 : 170;
    return { radii: [r1, r1 + 72], inset: compact ? 26 : 30, spacing: 66 };
  }
  return compact
    ? { radii: [120, 206, 290], inset: 26, spacing: 58 }
    : { radii: [158, 262, 362], inset: 30, spacing: 64 };
}

export function originFor(corner: Corner, width: number, height: number, inset: number): Point {
  return { x: corner === 'bottom-right' ? width - inset : inset, y: height - inset };
}

/** Screen point → polar coordinates in the corner's quarter. */
export function toPolar(corner: Corner, origin: Point, p: Point): Polar {
  const dx = corner === 'bottom-right' ? origin.x - p.x : p.x - origin.x;
  const dy = origin.y - p.y;
  return { angle: (Math.atan2(dy, dx) * 180) / Math.PI, dist: Math.hypot(dx, dy) };
}

/** Polar → screen point. */
export function toScreen(corner: Corner, origin: Point, polar: Polar): Point {
  const rad = (polar.angle * Math.PI) / 180;
  const dx = Math.cos(rad) * polar.dist;
  const dy = Math.sin(rad) * polar.dist;
  return { x: corner === 'bottom-right' ? origin.x - dx : origin.x + dx, y: origin.y - dy };
}

const MIN_ANGLE = 4;
const BAND_SLACK = 25;
const MAX_ANGLE = 86;

/** Angles for the first ring: spread evenly across the quarter. */
export function firstRingAngles(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [45];
  const step = (MAX_ANGLE - MIN_ANGLE) / (count - 1);
  return Array.from({ length: count }, (_, i) => MIN_ANGLE + step * i);
}

/** Angles for a child ring, centered on the parent's angle and kept inside the quarter. */
export function childRingAngles(count: number, parentAngle: number, radius: number, spacing: number): number[] {
  if (count <= 0) return [];
  const step = Math.min((spacing / radius) * (180 / Math.PI), (MAX_ANGLE - MIN_ANGLE) / Math.max(1, count - 1));
  const span = step * (count - 1);
  let start = parentAngle - span / 2;
  if (start < MIN_ANGLE) start = MIN_ANGLE;
  if (start + span > MAX_ANGLE) start = MAX_ANGLE - span;
  return Array.from({ length: count }, (_, i) => start + step * i);
}

/**
 * Angles for a ring whose labels sit beside each dot (horizontal text). Dots are spread so that
 * their heights above the corner are at least `gap` px apart, which keeps the labels from
 * overlapping even near the vertical, where a quarter circle bunches items together.
 */
export function stackedAngles(count: number, radius: number, gap: number, centerAngle?: number): number[] {
  if (count <= 0) return [];
  const yMin = radius * Math.sin((MIN_ANGLE * Math.PI) / 180);
  const yMax = radius * Math.sin((MAX_ANGLE * Math.PI) / 180);
  let step = count > 1 ? Math.max(gap, Math.min(gap * 1.8, (yMax - yMin) / (count - 1))) : 0;
  if (centerAngle === undefined && count > 1) step = Math.max(gap, (yMax - yMin) / (count - 1));
  if (step * (count - 1) > yMax - yMin) step = (yMax - yMin) / Math.max(1, count - 1);
  const span = step * (count - 1);
  const center = centerAngle === undefined ? (yMin + yMax) / 2 : radius * Math.sin((centerAngle * Math.PI) / 180);
  let start = center - span / 2;
  if (start < yMin) start = yMin;
  if (start + span > yMax) start = yMax - span;
  return Array.from({ length: count }, (_, i) => (Math.asin(Math.min(1, (start + step * i) / radius)) * 180) / Math.PI);
}

/** Angles for items that overflow onto an outer ring (tabs beyond the first five). */
export function overflowRingAngles(count: number, radius: number, spacing: number): number[] {
  if (count <= 0) return [];
  const step = Math.min((spacing / radius) * (180 / Math.PI), (MAX_ANGLE - MIN_ANGLE) / Math.max(1, count - 1));
  return Array.from({ length: count }, (_, i) => MIN_ANGLE + step * i);
}

export interface PlacedItem<T> {
  item: T;
  /** Ring index (0 = innermost). */
  ring: number;
  angle: number;
  point: Point;
}

/**
 * Finds the item the pointer is aiming at. The ring is chosen by the pointer's distance from the
 * corner (the ring whose radius is closest), so moving outward toward a child arc never snags an item
 * of an inner ring. Within that ring the nearest item inside `hitRadius` wins; failing that, the item
 * with the closest angle (marking-menu tolerance), so a flick toward a dot selects it.
 */
export function hitTest<T>(
  placed: PlacedItem<T>[],
  pointer: Point,
  polar: Polar,
  radii: number[],
  hitRadius = 38,
): PlacedItem<T> | null {
  if (!placed.length || polar.dist < 36) return null;
  // Once past an inner ring (with some slack), aim at the next ring out: moving outward toward a
  // child arc must not snag inner items.
  const rings = [...new Set(placed.map((p) => p.ring))].sort((a, b) => a - b);
  let band = rings[0];
  for (const r of rings) if (r > rings[0] && polar.dist > radii[r - 1] + BAND_SLACK) band = r;
  const candidates = placed.filter((p) => p.ring === band);
  let best: PlacedItem<T> | null = null;
  let bestDist = Infinity;
  for (const p of candidates) {
    const d = Math.hypot(p.point.x - pointer.x, p.point.y - pointer.y);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  if (best && bestDist <= hitRadius) return best;
  if (polar.dist > radii[band] + BAND_SLACK + 20) return null;
  let pick: PlacedItem<T> | null = null;
  let diff = Infinity;
  for (const p of candidates) {
    const a = Math.abs(p.angle - polar.angle);
    if (a < diff) {
      diff = a;
      pick = p;
    }
  }
  return pick && diff <= (band === 0 ? 25 : 10) ? pick : null;
}

/** Rough label width for placement decisions (Inter 14px). */
export function estimateLabelWidth(label: string): number {
  return Math.round(label.length * 7.6 + 30);
}

/**
 * Labels sit beside their dot on the side facing the middle of the screen. If that would run off
 * the screen edge, the label flips to the other side of the dot.
 */
export function labelSide(corner: Corner, dotX: number, labelWidth: number, screenWidth: number, dotRadius: number): 'inward' | 'outward' {
  const room = corner === 'bottom-right' ? dotX - dotRadius - 8 : screenWidth - dotX - dotRadius - 8;
  return room >= labelWidth + 8 ? 'inward' : 'outward';
}

export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** +1 when the pill sits right of its dot, −1 left. */
  side: 1 | -1;
}

/** Height of a label pill (Inter 14px with padding). */
export const LABEL_HEIGHT = 28;

/**
 * The label pill's box beside a dot: on the side facing the middle of the screen unless that runs
 * off the edge (see labelSide), `dotRadius + 6` px from the dot's center, vertically centered.
 */
export function labelBox(corner: Corner, dot: Point, text: string, screenWidth: number, dotRadius: number): LabelBox {
  const w = estimateLabelWidth(text);
  const inward = labelSide(corner, dot.x, w, screenWidth, dotRadius) === 'inward';
  const left = corner === 'bottom-right' ? inward : !inward;
  const gap = dotRadius + 6;
  return { x: left ? dot.x - gap - w : dot.x + gap, y: dot.y - LABEL_HEIGHT / 2, w, h: LABEL_HEIGHT, side: left ? -1 : 1 };
}

export function inBox(box: { x: number; y: number; w: number; h: number }, p: Point, slack = 4): boolean {
  return p.x >= box.x - slack && p.x <= box.x + box.w + slack && p.y >= box.y - slack && p.y <= box.y + box.h + slack;
}
