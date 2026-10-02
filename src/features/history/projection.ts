import type { BaseMap, Place } from '@/lib/data/types';

// Map geometry for the self-hosted base map (naturalearth/base.json). Pure functions only, so they
// can be unit-tested and shared by the web and native renderers.
//
//   k = height / (north − south)            map units per degree of latitude (20 for our map)
//   x = (lon − west) × cos(lat0°) × k
//   y = (north − lat) × k

export type MapGeometry = Pick<BaseMap, 'bbox' | 'width' | 'height' | 'lat0'>;

/** A place projected into map units, ready to draw. */
export interface MapPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Verses that mention the place: labels for well-known places win when space is short. */
  n: number;
}

/** Screen = map × s + (tx, ty). */
export interface MapView {
  tx: number;
  ty: number;
  s: number;
}

export type Box = [x0: number, y0: number, x1: number, y1: number];

export function scaleOf(map: Pick<BaseMap, 'bbox' | 'height'>): number {
  return map.height / (map.bbox[3] - map.bbox[1]);
}

export function project(lon: number, lat: number, map: MapGeometry): [number, number] {
  const k = scaleOf(map);
  const [west, , , north] = map.bbox;
  return [(lon - west) * Math.cos((map.lat0 * Math.PI) / 180) * k, (north - lat) * k];
}

/** Projects places once, so panning and zooming never redo the math. */
export function projectPlaces(places: Place[], map: MapGeometry): MapPoint[] {
  return places.map((p) => {
    const [x, y] = project(p.lon, p.lat, map);
    return { id: p.id, name: p.name, x, y, n: p.n };
  });
}

export function boundsOf(points: { x: number; y: number }[]): Box | null {
  if (!points.length) return null;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return [x0, y0, x1, y1];
}

/** Grows a box to at least `min` map units in each direction, keeping its center. */
export function atLeast(box: Box, min: number): Box {
  const [x0, y0, x1, y1] = box;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = Math.max(min, x1 - x0);
  const h = Math.max(min, y1 - y0);
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

/** The view that shows `box` inside a viewport of vw × vh pixels with `pad` pixels to spare. */
export function fitBox(box: Box, vw: number, vh: number, pad = 0): MapView {
  const [x0, y0, x1, y1] = box;
  const w = Math.max(1e-6, x1 - x0);
  const h = Math.max(1e-6, y1 - y0);
  const s = Math.min((vw - 2 * pad) / w, (vh - 2 * pad) / h);
  return { s, tx: vw / 2 - ((x0 + x1) / 2) * s, ty: vh / 2 - ((y0 + y1) / 2) * s };
}

/** A view of the given scale centered on a map point. */
export function centerOn(x: number, y: number, s: number, vw: number, vh: number): MapView {
  return { s, tx: vw / 2 - x * s, ty: vh / 2 - y * s };
}

export function toMap(view: MapView, px: number, py: number): [number, number] {
  return [(px - view.tx) / view.s, (py - view.ty) / view.s];
}

export function toScreen(view: MapView, x: number, y: number): [number, number] {
  return [x * view.s + view.tx, y * view.s + view.ty];
}

export interface ViewLimits {
  minS: number;
  maxS: number;
  /** Map size in map units: the viewport center stays over the map. */
  width: number;
  height: number;
}

/** Keeps the scale within limits and the middle of the viewport over the map. */
export function clampView(view: MapView, vw: number, vh: number, limits: ViewLimits): MapView {
  const s = Math.min(limits.maxS, Math.max(limits.minS, view.s));
  // Rescale around the viewport center if the scale had to change.
  let { tx, ty } = view;
  if (s !== view.s) {
    const [cx, cy] = toMap(view, vw / 2, vh / 2);
    tx = vw / 2 - cx * s;
    ty = vh / 2 - cy * s;
  }
  const cx = Math.min(limits.width, Math.max(0, (vw / 2 - tx) / s));
  const cy = Math.min(limits.height, Math.max(0, (vh / 2 - ty) / s));
  return { s, tx: vw / 2 - cx * s, ty: vh / 2 - cy * s };
}

/** Zooms by `factor` keeping the map point under (px, py) fixed on screen. */
export function zoomAt(view: MapView, factor: number, px: number, py: number, vw: number, vh: number, limits: ViewLimits): MapView {
  const s = Math.min(limits.maxS, Math.max(limits.minS, view.s * factor));
  const [mx, my] = toMap(view, px, py);
  return clampView({ s, tx: px - mx * s, ty: py - my * s }, vw, vh, limits);
}

/**
 * The place under a tap: the nearest point within `radius` screen pixels. When several points sit
 * on top of each other (Jerusalem and Judea share coordinates), tapping again moves to the next one.
 */
export function hitTest(points: MapPoint[], view: MapView, px: number, py: number, radius: number, current?: string | null): MapPoint | null {
  const [mx, my] = toMap(view, px, py);
  const r = radius / view.s;
  const near: { p: MapPoint; d: number }[] = [];
  for (const p of points) {
    const d = Math.hypot(p.x - mx, p.y - my);
    if (d <= r) near.push({ p, d });
  }
  if (!near.length) return null;
  near.sort((a, b) => a.d - b.d || b.p.n - a.p.n);
  const tie = 2 / view.s;
  const stack = near.filter((c) => c.d - near[0].d <= tie);
  const i = stack.findIndex((c) => c.p.id === current);
  return stack[i >= 0 ? (i + 1) % stack.length : 0].p;
}

/**
 * Label sizes are quantized, so labels are laid out again only when the zoom crosses a step
 * (steps of 2^(1/3)); in between, text scales slightly with the map (±12%).
 */
export function labelScale(s: number): number {
  return 2 ** (Math.round(Math.log2(s) * 3) / 3);
}

/** Rough width of a run of interface text (Inter) in pixels. */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56;
}

export interface LabelCandidate {
  id: string;
  text: string;
  x: number;
  y: number;
  /** Higher goes first. */
  priority: number;
  /** Always shown (the selected place), beside its dot when nothing else fits. */
  force?: boolean;
}

export interface PlacedLabel {
  id: string;
  text: string;
  /** Text anchor point in map units. */
  x: number;
  y: number;
  anchor: 'start' | 'end' | 'middle';
}

function overlaps(a: Box, b: Box) {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/**
 * Greedy label placement without overlaps: candidates in priority order try the right, left, top,
 * and bottom of their dot; a label that fits nowhere is left out (its place stays in the list
 * below the map). Sizes are in screen pixels at map scale `s`; positions are in map units.
 */
export function placeLabels(
  candidates: LabelCandidate[],
  s: number,
  opts: { fontSize: number; gap: number; region?: Box; avoid?: Box[]; max?: number },
): PlacedLabel[] {
  const { fontSize, gap, region, max = Infinity } = opts;
  const h = (fontSize * 1.25) / s;
  const g = gap / s;
  const placed: Box[] = [];
  const out: PlacedLabel[] = [];
  // A coarse grid keeps the overlap checks local.
  const cell = Math.max(h * 6, 1e-6);
  const grid = new Map<string, number[]>();
  const keysFor = (b: Box) => {
    const keys: string[] = [];
    for (let i = Math.floor(b[0] / cell); i <= Math.floor(b[2] / cell); i++) {
      for (let j = Math.floor(b[1] / cell); j <= Math.floor(b[3] / cell); j++) keys.push(`${i},${j}`);
    }
    return keys;
  };
  const add = (b: Box) => {
    placed.push(b);
    for (const k of keysFor(b)) {
      const list = grid.get(k);
      if (list) list.push(placed.length - 1);
      else grid.set(k, [placed.length - 1]);
    }
  };
  for (const b of opts.avoid ?? []) add(b);
  const free = (b: Box) => {
    for (const k of keysFor(b)) for (const i of grid.get(k) ?? []) if (overlaps(b, placed[i])) return false;
    return true;
  };

  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  for (const c of sorted) {
    if (out.length >= max) break;
    if (region && (c.x < region[0] || c.x > region[2] || c.y < region[1] || c.y > region[3])) continue;
    const w = textWidth(c.text, fontSize) / s;
    // Above and below clear the band of a label beside the dot, so all four can coexist.
    const v = h / 2 + 1 / s;
    const options: [Box, PlacedLabel][] = [
      [[c.x + g, c.y - h / 2, c.x + g + w, c.y + h / 2], { id: c.id, text: c.text, x: c.x + g, y: c.y, anchor: 'start' }],
      [[c.x - g - w, c.y - h / 2, c.x - g, c.y + h / 2], { id: c.id, text: c.text, x: c.x - g, y: c.y, anchor: 'end' }],
      [[c.x - w / 2, c.y - v - h, c.x + w / 2, c.y - v], { id: c.id, text: c.text, x: c.x, y: c.y - v - h / 2, anchor: 'middle' }],
      [[c.x - w / 2, c.y + v, c.x + w / 2, c.y + v + h], { id: c.id, text: c.text, x: c.x, y: c.y + v + h / 2, anchor: 'middle' }],
    ];
    const fit = options.find(([box]) => free(box)) ?? (c.force ? options[0] : undefined);
    if (fit) {
      add(fit[0]);
      out.push(fit[1]);
    }
  }
  return out;
}

/**
 * The closed rings of an SVG path made of M/m, L/l, and z commands (the base map's format), as
 * absolute points.
 */
export function pathRings(d: string): [number, number][][] {
  const rings: [number, number][][] = [];
  const tokens = d.match(/[MmLlZz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let ring: [number, number][] = [];
  let cmd = 'M';
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (/[A-Za-z]/.test(tok)) {
      cmd = tok;
      if (cmd === 'z' || cmd === 'Z') {
        if (ring.length > 2) rings.push(ring);
        ring = [];
      }
      continue;
    }
    const a = Number(tok);
    const b = Number(tokens[++i]);
    const rel = cmd === 'm' || cmd === 'l';
    x = rel ? x + a : a;
    y = rel ? y + b : b;
    if (cmd === 'M' || cmd === 'm') {
      if (ring.length > 2) rings.push(ring);
      ring = [[x, y]];
      cmd = cmd === 'M' ? 'L' : 'l';
    } else {
      ring.push([x, y]);
    }
  }
  if (ring.length > 2) rings.push(ring);
  return rings;
}

/** Bounding box of the ring that contains (x, y), or null (even-odd ray casting). */
export function ringAt(rings: [number, number][][], x: number, y: number): Box | null {
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) {
      const b = boundsOf(ring.map(([px, py]) => ({ x: px, y: py })));
      if (b) return b;
    }
  }
  return null;
}

/** One SVG path that draws every marker as a round dot (zero-length segments with round caps). */
export function dotsPath(points: { x: number; y: number }[]): string {
  let d = '';
  for (const p of points) d += `M${p.x.toFixed(2)} ${p.y.toFixed(2)}h0`;
  return d;
}

/** OpenBible.info's score is roughly a percentage × 10 of current scholarly confidence. */
export type Confidence = 'high' | 'medium' | 'low';

export function confidenceOf(score: number): Confidence {
  if (score >= 700) return 'high';
  if (score >= 300) return 'medium';
  return 'low';
}
