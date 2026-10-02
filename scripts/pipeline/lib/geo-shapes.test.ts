import { describe, expect, it } from 'vitest';

import { BASEMAP_PROJECTION, makeProjection, projectLonLat, scaleOf } from './geo-projection';
import {
  clipLine,
  clipRing,
  decodePath,
  distanceToLine,
  encodePath,
  labelPoint,
  orient,
  pointInRings,
  type Pt,
  quantize,
  ringArea,
  simplifyLine,
  simplifyRing,
} from './geo-shapes';

describe('projection', () => {
  it('is equirectangular with longitudes scaled by cos(lat0)', () => {
    const p = BASEMAP_PROJECTION;
    expect(p.height).toBe(600);
    expect(p.width).toBeCloseTo(1039.23, 2);
    expect(projectLonLat(5, 45, p)).toEqual([0, 0]);
    const [x, y] = projectLonLat(65, 15, p);
    expect(x).toBeCloseTo(p.width, 9);
    expect(y).toBeCloseTo(600, 9);
    // Jerusalem (OpenBible.info): 35.234167, 31.776667.
    const [jx, jy] = projectLonLat(35.234167, 31.776667, p);
    expect(jx).toBeCloseTo((35.234167 - 5) * Math.cos(Math.PI / 6) * 20, 9);
    expect(jy).toBeCloseTo((45 - 31.776667) * 20, 9);
  });

  it('recovers k from the BaseMap fields', () => {
    expect(scaleOf({ bbox: [5, 15, 65, 45], height: 600 })).toBe(20);
    expect(makeProjection([0, 0, 10, 10], 0, 3).width).toBe(30);
  });
});

describe('clipping', () => {
  it('clips a ring to the rectangle', () => {
    const ring: Pt[] = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    const c = clipRing(ring, 10, 10);
    expect(Math.abs(ringArea(c))).toBeCloseTo(25, 9);
    expect(c.every(([x, y]) => x >= 0 && y >= 0)).toBe(true);
    expect(clipRing([[20, 20], [30, 20], [30, 30]], 10, 10)).toEqual([]);
  });

  it('splits a line that leaves and re-enters', () => {
    const runs = clipLine([[1, 5], [15, 5], [15, 7], [1, 7]], 10, 10);
    expect(runs).toEqual([
      [[1, 5], [10, 5]],
      [[10, 7], [1, 7]],
    ]);
    expect(clipLine([[12, 1], [14, 2]], 10, 10)).toEqual([]);
  });
});

describe('Douglas–Peucker', () => {
  it('drops near-collinear points and keeps corners', () => {
    const line: Pt[] = [[0, 0], [1, 0.01], [2, -0.01], [3, 0], [3, 3]];
    expect(simplifyLine(line, 0.05)).toEqual([[0, 0], [3, 0], [3, 3]]);
    for (const p of line) expect(distanceToLine(p, simplifyLine(line, 0.05))).toBeLessThanOrEqual(0.05);
  });

  it('never reduces a ring below a triangle', () => {
    const tiny: Pt[] = [[0, 0], [0.01, 0], [0.02, 0.001], [0.01, 0.02], [0, 0.01]];
    expect(simplifyRing(tiny, 1).length).toBe(3);
    const square: Pt[] = [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]];
    expect(simplifyRing(square, 0.1)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });
});

describe('area, orientation, containment, labels', () => {
  const sq: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const hole: Pt[] = [[4, 4], [6, 4], [6, 6], [4, 6]];

  it('orients outer rings clockwise on screen and holes the other way', () => {
    expect(ringArea(sq)).toBe(100);
    expect(ringArea(orient(sq, false))).toBe(-100);
    expect(orient(sq, true)).toBe(sq);
  });

  it('uses even-odd containment', () => {
    expect(pointInRings([1, 1], [sq, hole])).toBe(true);
    expect(pointInRings([5, 5], [sq, hole])).toBe(false);
    expect(pointInRings([11, 5], [sq, hole])).toBe(false);
  });

  it('places labels inside concave shapes', () => {
    // An L shape whose centroid (≈ 3.9, 3.9) is near the inner corner; the label goes in an arm.
    const L: Pt[] = [[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10]];
    const p = labelPoint([L])!;
    expect(pointInRings(p, [L])).toBe(true);
    expect(labelPoint([[[0, 0], [10, 0], [10, 10], [0, 10]]])![0]).toBeCloseTo(5, 0);
  });
});

describe('SVG paths', () => {
  it('rounds to 0.1 with relative steps and no drift', () => {
    const d = encodePath([[[523.44, 312.71], [524.66, 312.4], [525.1, 312.52]]], true);
    expect(d).toBe('M523.4 312.7l1.3-0.3 0.4 0.1z');
    expect(decodePath(d)).toEqual([[[523.4, 312.7], [524.7, 312.4], [525.1, 312.5]]]);
  });

  it('encodes open lines, drops degenerate shapes and repeated points', () => {
    expect(encodePath([[[0, 0], [0.01, 0.01]], [[1, 1], [2, 2]]], false)).toBe('M1 1l1 1');
    expect(quantize([[0, 0], [0.04, 0], [1, 0], [0, 0]], true)).toEqual([[0, 0], [10, 0]]);
  });

  it('round-trips many points exactly', () => {
    const pts: Pt[] = Array.from({ length: 200 }, (_, i) => [100 + Math.sin(i) * 37.37, 50 + i * 0.73]);
    const back = decodePath(encodePath([pts], false))[0];
    back.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(Math.round(pts[i][0] * 10) / 10, 9);
      expect(y).toBeCloseTo(Math.round(pts[i][1] * 10) / 10, 9);
    });
  });
});
