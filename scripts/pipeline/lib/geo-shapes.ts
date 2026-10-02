// Planar shape helpers for the base map, in projected map units: clipping to the map rectangle,
// Douglas–Peucker simplification, ring area and orientation, point-in-polygon, label placement,
// and compact SVG path encoding. No dependencies.

export type Pt = [number, number];
/** A polygon ring without the repeated closing point. */
export type Ring = Pt[];

// ---------------------------------------------------------------------------------------------
// Clipping to [0, w] × [0, h]

/** Sutherland–Hodgman clip of a closed ring to the rectangle. Returns [] when nothing is inside. */
export function clipRing(ring: Ring, w: number, h: number): Ring {
  type Edge = { inside: (p: Pt) => boolean; cut: (a: Pt, b: Pt) => Pt };
  const atX = (x: number) => (a: Pt, b: Pt): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const atY = (y: number) => (a: Pt, b: Pt): Pt => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  const edges: Edge[] = [
    { inside: (p) => p[0] >= 0, cut: atX(0) },
    { inside: (p) => p[0] <= w, cut: atX(w) },
    { inside: (p) => p[1] >= 0, cut: atY(0) },
    { inside: (p) => p[1] <= h, cut: atY(h) },
  ];
  let out = ring;
  for (const e of edges) {
    if (!out.length) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const ci = e.inside(cur);
      const pi = e.inside(prev);
      if (ci) {
        if (!pi) out.push(e.cut(prev, cur));
        out.push(cur);
      } else if (pi) {
        out.push(e.cut(prev, cur));
      }
    }
  }
  return out.length >= 3 ? out : [];
}

/** Liang–Barsky clip of a polyline to the rectangle; returns the inside runs. */
export function clipLine(line: Pt[], w: number, h: number): Pt[][] {
  const runs: Pt[][] = [];
  let run: Pt[] | null = null;
  for (let i = 0; i + 1 < line.length; i++) {
    const [x0, y0] = line[i];
    const [x1, y1] = line[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (const [p, q] of [[-dx, x0], [dx, w - x0], [-dy, y0], [dy, h - y0]] as const) {
      if (p === 0) {
        if (q < 0) ok = false;
      } else {
        const r = q / p;
        if (p < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
      }
    }
    if (!ok || t0 > t1) {
      run = null;
      continue;
    }
    const a: Pt = [x0 + t0 * dx, y0 + t0 * dy];
    const b: Pt = [x0 + t1 * dx, y0 + t1 * dy];
    if (!run || t0 > 0) {
      run = [a];
      runs.push(run);
    }
    run.push(b);
    if (t1 < 1) run = null;
  }
  return runs.filter((r) => r.length >= 2);
}

// ---------------------------------------------------------------------------------------------
// Douglas–Peucker

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = a[0] + t * dx - p[0];
  const ey = a[1] + t * dy - p[1];
  return Math.sqrt(ex * ex + ey * ey);
}

/** Shortest distance from a point to a polyline. */
export function distanceToLine(p: Pt, line: Pt[]): number {
  if (line.length === 1) return Math.hypot(p[0] - line[0][0], p[1] - line[0][1]);
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, segDist(p, line[i], line[i + 1]));
  return best;
}

/** Douglas–Peucker on an open polyline; keeps both ends. Iterative, so long lines are safe. */
export function simplifyLine(points: Pt[], tolerance: number): Pt[] {
  const n = points.length;
  if (n <= 2) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let best = -1;
    let bestD = tolerance;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(points[i], points[s], points[e]);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Douglas–Peucker on a closed ring: split at the vertex farthest from the first one and simplify
 * both halves. Never returns fewer than 3 points while the input had them, so small islands
 * survive as triangles at worst instead of vanishing.
 */
export function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 3) return ring.slice();
  let far = 1;
  let farD = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = simplifyLine(ring.slice(0, far + 1), tolerance);
  const b = simplifyLine([...ring.slice(far), ring[0]], tolerance);
  let out = [...a, ...b.slice(1, -1)];
  if (out.length < 3) {
    // Keep the start, the far point and the point farthest from that chord.
    let third = -1;
    let thirdD = -1;
    for (let i = 1; i < ring.length; i++) {
      if (i === far) continue;
      const d = segDist(ring[i], ring[0], ring[far]);
      if (d > thirdD) {
        thirdD = d;
        third = i;
      }
    }
    out = [0, far, third].sort((x, y) => x - y).map((i) => ring[i]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Area, orientation, containment, labels

/** Signed shoelace area. In screen coordinates (y down) positive means clockwise on screen. */
export function ringArea(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** Returns the ring with the requested winding (clockwise on screen when `clockwise`). */
export function orient(ring: Ring, clockwise: boolean): Ring {
  return ringArea(ring) > 0 === clockwise ? ring : ring.slice().reverse();
}

export function pointInRing(p: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd containment over several rings (outer rings and holes alike). */
export function pointInRings(p: Pt, rings: Ring[]): boolean {
  let inside = false;
  for (const r of rings) if (pointInRing(p, r)) inside = !inside;
  return inside;
}

function edgeDistance(p: Pt, rings: Ring[]): number {
  let best = Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const d = segDist(p, r[i], r[(i + 1) % r.length]);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * A good label position: the interior point farthest from any edge (pole of inaccessibility),
 * found by a grid search refined around the best cell. Centroids of concave seas can fall on
 * land, so this is used instead.
 */
export function labelPoint(rings: Ring[], grid = 48, rounds = 4): Pt | null {
  const pts = rings.flat();
  if (!pts.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  let best: Pt | null = null;
  let bestD = -1;
  let cx = (minX + maxX) / 2;
  let cy = (minY + maxY) / 2;
  let sx = maxX - minX;
  let sy = maxY - minY;
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i <= grid; i++) {
      for (let j = 0; j <= grid; j++) {
        const p: Pt = [cx - sx / 2 + (sx * i) / grid, cy - sy / 2 + (sy * j) / grid];
        if (!pointInRings(p, rings)) continue;
        const d = edgeDistance(p, rings);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    if (!best) return null;
    [cx, cy] = best;
    sx = (sx / grid) * 4;
    sy = (sy / grid) * 4;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// SVG path encoding

const tenths = (v: number) => Math.round(v * 10);
const fmt = (t: number) => String(t / 10);

/** Rounds to 0.1 units and removes repeated points (and the closing point of rings). */
export function quantize(points: Pt[], closed: boolean): [number, number][] {
  const out: [number, number][] = [];
  for (const [x, y] of points) {
    const q: [number, number] = [tenths(x), tenths(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  if (closed && out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}

function pushNums(parts: string[], nums: number[]) {
  for (const n of nums) {
    const s = fmt(n);
    const prev = parts[parts.length - 1];
    parts.push(s[0] === '-' || /[A-Za-z]$/.test(prev) ? s : ` ${s}`);
  }
}

/**
 * Encodes rings (closed, "z") or lines (open) as one SVG path: an absolute "M" per subpath, then
 * relative "l" steps between points already rounded to 0.1, so rounding errors never accumulate.
 * Example: "M523.4 312.7l1.2-0.3 0.5 0.1z".
 */
export function encodePath(shapes: Pt[][], closed: boolean): string {
  const parts: string[] = [];
  for (const shape of shapes) {
    const q = quantize(shape, closed);
    if (q.length < (closed ? 3 : 2)) continue;
    parts.push('M');
    pushNums(parts, q[0]);
    parts.push('l');
    for (let i = 1; i < q.length; i++) pushNums(parts, [q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]]);
    if (closed) parts.push('z');
  }
  return parts.join('');
}

/** Parses a path produced by encodePath back into absolute points (for verification and tests). */
export function decodePath(d: string): Pt[][] {
  const shapes: Pt[][] = [];
  for (const m of d.matchAll(/M([^l]+)l([^Mz]*)z?/g)) {
    const nums = (s: string) => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const [x, y] = nums(m[1]);
    const shape: Pt[] = [[x, y]];
    const steps = nums(m[2]);
    let cx = Math.round(x * 10);
    let cy = Math.round(y * 10);
    for (let i = 0; i + 1 < steps.length; i += 2) {
      cx += Math.round(steps[i] * 10);
      cy += Math.round(steps[i + 1] * 10);
      shape.push([cx / 10, cy / 10]);
    }
    shapes.push(shape);
  }
  return shapes;
}
