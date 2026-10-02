import { describe, expect, it } from 'vitest';

import {
  childRingAngles,
  stackedAngles,
  firstRingAngles,
  hitTest,
  layoutFor,
  originFor,
  type PlacedItem,
  toPolar,
  toScreen,
} from './geometry';

describe('radial geometry', () => {
  it('places the origin inside the chosen corner', () => {
    expect(originFor('bottom-right', 400, 800, 26)).toEqual({ x: 374, y: 774 });
    expect(originFor('bottom-left', 400, 800, 26)).toEqual({ x: 26, y: 774 });
  });

  it('round-trips polar and screen coordinates in both corners', () => {
    for (const corner of ['bottom-right', 'bottom-left'] as const) {
      const origin = originFor(corner, 1280, 800, 30);
      const p = toScreen(corner, origin, { angle: 30, dist: 100 });
      const back = toPolar(corner, origin, p);
      expect(back.angle).toBeCloseTo(30);
      expect(back.dist).toBeCloseTo(100);
    }
  });

  it('fans the first ring across the quarter toward the screen', () => {
    const angles = firstRingAngles(5);
    expect(angles).toHaveLength(5);
    expect(angles[0]).toBeGreaterThan(0);
    expect(angles[4]).toBeLessThan(90);
    const origin = originFor('bottom-right', 400, 800, 26);
    for (const a of angles) {
      const p = toScreen('bottom-right', origin, { angle: a, dist: 112 });
      expect(p.x).toBeLessThanOrEqual(origin.x);
      expect(p.y).toBeLessThan(origin.y);
    }
    const left = toScreen('bottom-left', originFor('bottom-left', 400, 800, 26), { angle: 10, dist: 112 });
    expect(left.x).toBeGreaterThan(26);
  });

  it('keeps child rings inside the quarter', () => {
    const near90 = childRingAngles(5, 86, 204, 58);
    expect(Math.max(...near90)).toBeLessThanOrEqual(86.0001);
    const near0 = childRingAngles(5, 4, 204, 58);
    expect(Math.min(...near0)).toBeGreaterThanOrEqual(3.9999);
    const centered = childRingAngles(3, 45, 204, 58);
    expect((centered[0] + centered[2]) / 2).toBeCloseTo(45);
  });

  it('stacks labelled rings so neighboring dots are at least a label apart vertically', () => {
    for (const [count, r, center] of [[5, 136, undefined], [5, 228, 80], [4, 314, 10], [2, 136, undefined]] as const) {
      const angles = stackedAngles(count, r, 30, center);
      expect(angles).toHaveLength(count);
      const ys = angles.map((a) => r * Math.sin((a * Math.PI) / 180));
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(29.9);
      expect(Math.max(...angles)).toBeLessThanOrEqual(86.0001);
      expect(Math.min(...angles)).toBeGreaterThanOrEqual(3.9999);
    }
  });

  it('fits the tabs and menu rings on a small phone', () => {
    const { radii, inset } = layoutFor(360, 640, 'menu');
    expect(radii[radii.length - 1] + inset + 20).toBeLessThan(360);
    const tabs = layoutFor(360, 640, 'tabs');
    expect(tabs.radii[1] + tabs.inset + 30).toBeLessThan(360);
  });

  it('hit-tests by distance, then by angle in the first ring', () => {
    const origin = originFor('bottom-right', 400, 800, 26);
    const radii = [112, 204];
    const placed: PlacedItem<string>[] = firstRingAngles(3).map((angle, i) => ({
      item: ['a', 'b', 'c'][i],
      ring: 0,
      angle,
      point: toScreen('bottom-right', origin, { angle, dist: radii[0] }),
    }));
    const onB = placed[1].point;
    expect(hitTest(placed, onB, toPolar('bottom-right', origin, onB), radii)?.item).toBe('b');
    // A short flick toward "c" (steep angle, well inside the ring) still selects it.
    const flick = toScreen('bottom-right', origin, { angle: 80, dist: 60 });
    expect(hitTest(placed, flick, toPolar('bottom-right', origin, flick), radii)?.item).toBe('c');
    // Moving outward toward a child ring ignores inner-ring items it passes near.
    const child: PlacedItem<string> = { item: 'child', ring: 1, angle: 20, point: toScreen('bottom-right', origin, { angle: 20, dist: radii[1] }) };
    const nearB = toScreen('bottom-right', origin, { angle: placed[1].angle, dist: radii[0] + 50 });
    expect(hitTest([...placed, child], nearB, toPolar('bottom-right', origin, nearB), radii)?.item).not.toBe('b');
    expect(hitTest([...placed, child], child.point, toPolar('bottom-right', origin, child.point), radii)?.item).toBe('child');
    // Too close to the corner selects nothing.
    const tiny = toScreen('bottom-right', origin, { angle: 45, dist: 10 });
    expect(hitTest(placed, tiny, toPolar('bottom-right', origin, tiny), radii)).toBeNull();
  });
});
