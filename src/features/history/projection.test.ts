import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { BaseMap } from '@/lib/data/types';

import {
  atLeast,
  boundsOf,
  centerOn,
  clampView,
  confidenceOf,
  dotsPath,
  fitBox,
  hitTest,
  labelScale,
  type MapPoint,
  pathRings,
  placeLabels,
  project,
  projectPlaces,
  ringAt,
  scaleOf,
  toMap,
  toScreen,
  zoomAt,
} from './projection';

const MAP = { bbox: [5, 15, 65, 45] as [number, number, number, number], width: 1039.2, height: 600, lat0: 30 };

describe('projection', () => {
  it('derives k = height / (north − south)', () => {
    expect(scaleOf(MAP)).toBe(20);
  });

  it('projects the corners of the bounding box onto the map edges', () => {
    const [x0, y0] = project(5, 45, MAP);
    expect(x0).toBeCloseTo(0);
    expect(y0).toBeCloseTo(0);
    const [x1, y1] = project(65, 15, MAP);
    expect(x1).toBeCloseTo(MAP.width, 0);
    expect(y1).toBeCloseTo(MAP.height);
  });

  it('places Jerusalem with the documented formula', () => {
    const [x, y] = project(35.234167, 31.776667, MAP);
    expect(x).toBeCloseTo((35.234167 - 5) * Math.cos(Math.PI / 6) * 20, 6);
    expect(y).toBeCloseTo((45 - 31.776667) * 20, 6);
  });

  it('matches the shipped base map size', () => {
    const file = join(__dirname, '..', '..', '..', 'public', 'data', 'naturalearth', 'base.json');
    let base: BaseMap;
    try {
      base = JSON.parse(readFileSync(file, 'utf8')) as BaseMap;
    } catch {
      return; // data not generated in this checkout
    }
    expect(scaleOf(base)).toBe(20);
    const [x] = project(base.bbox[2], base.bbox[1], base);
    expect(x).toBeCloseTo(base.width, 0);
  });

  it('projects places once into map points', () => {
    const pts = projectPlaces([{ id: 'a', name: 'A', lon: 5, lat: 45, type: 'settlement', score: 1000, n: 3 }], MAP);
    expect(pts).toEqual([{ id: 'a', name: 'A', x: 0, y: 0, n: 3 }]);
  });
});

describe('views', () => {
  const limits = { minS: 0.5, maxS: 50, width: MAP.width, height: MAP.height };

  it('fits a box in the viewport, centered', () => {
    const v = fitBox([0, 0, 100, 50], 400, 400, 0);
    expect(v.s).toBe(4);
    expect(toScreen(v, 50, 25)).toEqual([200, 200]);
  });

  it('round-trips screen and map coordinates', () => {
    const v = { s: 3, tx: -40, ty: 12 };
    const [x, y] = toMap(v, 100, 200);
    expect(toScreen(v, x, y)).toEqual([100, 200]);
  });

  it('zooms about a point, keeping it fixed on screen', () => {
    const v = centerOn(500, 300, 2, 400, 300);
    const z = zoomAt(v, 2, 100, 100, 400, 300, limits);
    expect(z.s).toBe(4);
    const before = toMap(v, 100, 100);
    const after = toMap(z, 100, 100);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it('limits the scale', () => {
    const v = centerOn(500, 300, 40, 400, 300);
    expect(zoomAt(v, 4, 200, 150, 400, 300, limits).s).toBe(50);
    expect(zoomAt(v, 0.001, 200, 150, 400, 300, limits).s).toBe(0.5);
  });

  it('keeps the viewport center over the map', () => {
    const far = { s: 2, tx: 5000, ty: 5000 };
    const c = clampView(far, 400, 300, limits);
    const [cx, cy] = toMap(c, 200, 150);
    expect(cx).toBe(0);
    expect(cy).toBe(0);
  });

  it('grows tiny boxes so a single place is not over-zoomed', () => {
    expect(atLeast([10, 10, 10, 10], 30)).toEqual([-5, -5, 25, 25]);
    expect(boundsOf([{ x: 1, y: 2 }, { x: 5, y: -1 }])).toEqual([1, -1, 5, 2]);
    expect(boundsOf([])).toBeNull();
  });

  it('quantizes label scales to steps', () => {
    expect(labelScale(1)).toBe(1);
    expect(labelScale(2)).toBe(2);
    expect(labelScale(1.05)).toBe(1);
    expect(labelScale(1.2)).toBeCloseTo(2 ** (1 / 3));
  });
});

describe('hit testing', () => {
  const pts: MapPoint[] = [
    { id: 'jerusalem', name: 'Jerusalem', x: 100, y: 100, n: 955 },
    { id: 'judea-1', name: 'Judea', x: 100, y: 100, n: 52 },
    { id: 'jordan', name: 'Jordan', x: 110, y: 100, n: 202 },
  ];
  const view = { s: 4, tx: 0, ty: 0 };

  it('finds the nearest place within the touch radius', () => {
    expect(hitTest(pts, view, 441, 400, 22)?.id).toBe('jordan');
    expect(hitTest(pts, view, 400, 401, 22)?.id).toBe('jerusalem');
    expect(hitTest(pts, view, 900, 900, 22)).toBeNull();
  });

  it('cycles through places stacked on the same spot', () => {
    expect(hitTest(pts, view, 400, 400, 22, 'jerusalem')?.id).toBe('judea-1');
    expect(hitTest(pts, view, 400, 400, 22, 'judea-1')?.id).toBe('jerusalem');
  });
});

describe('labels', () => {
  it('never overlaps and gives priority to important places', () => {
    const labels = placeLabels(
      [
        { id: 'a', text: 'Aenon', x: 0, y: 0, priority: 1 },
        { id: 'b', text: 'Salim', x: 0, y: 0.5, priority: 5 },
        { id: 'c', text: 'Far away', x: 100, y: 100, priority: 0 },
      ],
      10,
      { fontSize: 12, gap: 6 },
    );
    expect(labels[0].id).toBe('b');
    expect(labels.map((l) => l.id).sort()).toEqual(['a', 'b', 'c']);
    // Aenon moved off the right side, which Salim took.
    expect(labels.find((l) => l.id === 'b')!.anchor).toBe('start');
    expect(labels.find((l) => l.id === 'a')!.anchor).not.toBe('start');
  });

  it('drops labels that fit nowhere', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: String(i), text: 'Jerusalem', x: 0, y: 0, priority: i }));
    const labels = placeLabels(many, 1, { fontSize: 12, gap: 6 });
    expect(labels.length).toBe(4);
    expect(labels[0].id).toBe('5');
  });

  it('always shows a forced label (the selected place), even when everything around is taken', () => {
    const dot = 2;
    const blocked = [[-1000, -1000, 1000, 1000] as [number, number, number, number]];
    const c = [{ id: 'sel', text: 'Jerusalem', x: 0, y: 0, priority: 1e9, force: true }, { id: 'other', text: 'Judea', x: 0, y: 0, priority: 1 }];
    const labels = placeLabels(c, dot, { fontSize: 12, gap: 6, avoid: blocked });
    expect(labels.map((l) => [l.id, l.anchor])).toEqual([['sel', 'start']]);
  });

  it('skips candidates outside the region and respects the maximum', () => {
    const c = [
      { id: 'in', text: 'In', x: 5, y: 5, priority: 1 },
      { id: 'out', text: 'Out', x: 50, y: 50, priority: 2 },
    ];
    expect(placeLabels(c, 1, { fontSize: 12, gap: 6, region: [0, 0, 10, 10] }).map((l) => l.id)).toEqual(['in']);
    expect(placeLabels(c, 1, { fontSize: 12, gap: 6, max: 1 }).map((l) => l.id)).toEqual(['out']);
  });
});

describe('base map paths', () => {
  it('reads closed rings from M/l/z paths', () => {
    const rings = pathRings('M0 0l10 0 0 10-10 0zM20 20l5 0 0 5z');
    expect(rings).toEqual([
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [[20, 20], [25, 20], [25, 25]],
    ]);
  });

  it('finds the lake under a point', () => {
    const rings = pathRings('M0 0l10 0 0 20-10 0z');
    expect(ringAt(rings, 5, 5)).toEqual([0, 0, 10, 20]);
    expect(ringAt(rings, 15, 5)).toBeNull();
  });

  it('finds the Sea of Galilee and the Dead Sea among the shipped lakes', () => {
    let base: BaseMap;
    try {
      base = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'public', 'data', 'naturalearth', 'base.json'), 'utf8')) as BaseMap;
    } catch {
      return;
    }
    const rings = pathRings(base.lakes);
    const lakes = base.seas.filter((s) => ringAt(rings, s.x, s.y)).map((s) => s.name);
    expect(lakes).toEqual(expect.arrayContaining(['Dead Sea', 'Sea of Galilee']));
    expect(lakes).not.toContain('Mediterranean Sea');
  });
});

describe('markers and confidence', () => {
  it('draws all markers as one path of round dots', () => {
    expect(dotsPath([{ x: 1, y: 2 }, { x: 3.456, y: 4 }])).toBe('M1.00 2.00h0M3.46 4.00h0');
  });

  it('turns OpenBible scores into plain confidence levels', () => {
    expect(confidenceOf(1000)).toBe('high');
    expect(confidenceOf(700)).toBe('high');
    expect(confidenceOf(699)).toBe('medium');
    expect(confidenceOf(300)).toBe('medium');
    expect(confidenceOf(276)).toBe('low');
    expect(confidenceOf(0)).toBe('low');
  });
});
