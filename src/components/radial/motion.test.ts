import { describe, expect, it } from 'vitest';

import { labelBox, inBox } from './geometry';
import {
  BURST,
  clamp01,
  cubicBezier,
  drift,
  EXIT,
  FOLLOW,
  followTrail,
  itemTransform,
  LINE_BASE,
  lineTransform,
  magnet,
  POP,
  poseAt,
  previewPoints,
  proximity,
  SOFT,
  spring,
  stepSpring,
  type Tween,
  tweenAt,
  tweenDone,
  withAlpha,
} from './motion';

/** Runs a spring at 60 fps until it settles; returns the frames taken and the furthest it went. */
function settle(cfg: typeof POP, from: number, to: number) {
  const s = spring(from);
  let frames = 0;
  let peak = from;
  while (stepSpring(s, to, cfg, 1 / 60) && frames < 600) {
    frames++;
    peak = to > from ? Math.max(peak, s.x) : Math.min(peak, s.x);
  }
  return { s, frames, peak };
}

describe('springs', () => {
  it('settle exactly on the target', () => {
    for (const cfg of [POP, FOLLOW, SOFT]) {
      const { s, frames } = settle(cfg, 0, 1);
      expect(s.x).toBe(1);
      expect(s.v).toBe(0);
      expect(frames).toBeLessThan(90); // under 1.5 s
    }
  });

  it('POP overshoots a little (items pop into place); SOFT never does', () => {
    expect(settle(POP, 0, 1).peak).toBeGreaterThan(1.05);
    expect(settle(POP, 0, 1).peak).toBeLessThan(1.3);
    expect(settle(SOFT, 0, 1).peak).toBeLessThanOrEqual(1.0001);
  });

  it('is stable at low frame rates (big steps are split up)', () => {
    const s = spring(0);
    for (let i = 0; i < 60; i++) stepSpring(s, 100, POP, 1 / 10);
    expect(s.x).toBeCloseTo(100, 3);
  });

  it('reports a settled spring as not moving', () => {
    const s = spring(1);
    expect(stepSpring(s, 1, SOFT, 1 / 60)).toBe(false);
  });
});

describe('proximity and magnetism', () => {
  it('falls smoothly from 1 inside the inner radius to 0 at the edge', () => {
    expect(proximity(0, 100, 20)).toBe(1);
    expect(proximity(20, 100, 20)).toBe(1);
    expect(proximity(60, 100, 20)).toBeCloseTo(0.5, 5);
    expect(proximity(100, 100, 20)).toBe(0);
    expect(proximity(500, 100, 20)).toBe(0);
    expect(proximity(Infinity, 100)).toBe(0);
    // Monotonic.
    let prev = 1;
    for (let d = 0; d <= 100; d += 5) {
      const p = proximity(d, 100);
      expect(p).toBeLessThanOrEqual(prev);
      prev = p;
    }
  });

  it('leans toward the pointer, capped and scaled by strength', () => {
    const m = magnet({ x: 0, y: 0 }, { x: 100, y: 0 }, 1, 8);
    expect(m.x).toBeCloseTo(8);
    expect(m.y).toBeCloseTo(0);
    const half = magnet({ x: 0, y: 0 }, { x: 0, y: -100 }, 0.5, 8);
    expect(half.y).toBeCloseTo(-4);
    // Close in, the pull is a fraction of the gap, so an item never overshoots the pointer.
    const near = magnet({ x: 0, y: 0 }, { x: 5, y: 0 }, 1, 8);
    expect(near.x).toBeLessThan(5);
    expect(magnet({ x: 1, y: 1 }, { x: 1, y: 1 }, 1, 8)).toEqual({ x: 0, y: 0 });
    expect(magnet({ x: 0, y: 0 }, { x: 50, y: 0 }, 0, 8)).toEqual({ x: 0, y: 0 });
  });

  it('drifts within its amplitude', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const d = drift(t, 1.3, 2);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(2);
    }
  });
});

describe('transforms', () => {
  it('lays a line bar from one point to another', () => {
    expect(lineTransform({ x: 10, y: 20 }, { x: 10 + LINE_BASE * 2, y: 20 })).toBe('translate(10.00px, 20.00px) rotate(0.000deg) scaleX(2.0000)');
    expect(lineTransform({ x: 0, y: 0 }, { x: 0, y: -50 })).toContain('rotate(-90.000deg) scaleX(0.5000)');
  });

  it('formats item transforms, with rotation only when tilted', () => {
    expect(itemTransform(1, -2, 1.5)).toBe('translate(1.00px, -2.00px) scale(1.5000)');
    expect(itemTransform(0, 0, 1, 12)).toBe('translate(0.00px, 0.00px) rotate(12.00deg) scale(1.0000)');
    expect(itemTransform(0, 0, -0.2)).toContain('scale(0.0000)');
  });

  it('fans preview dots up and toward the middle of the screen from each corner', () => {
    const [right] = previewPoints('bottom-right', [0], 20);
    expect(right.x).toBeCloseTo(-20);
    expect(right.y).toBeCloseTo(0);
    const [left] = previewPoints('bottom-left', [90], 20);
    expect(left.x).toBeCloseTo(0);
    expect(left.y).toBeCloseTo(-20);
  });

  it('pulls a trail along behind its head', () => {
    const trail = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    for (let i = 0; i < 120; i++) followTrail(trail, { x: 100, y: 0 }, 0.5, 1 / 60);
    for (const p of trail) expect(p.x).toBeCloseTo(100, 1);
    const fresh = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    followTrail(fresh, { x: 100, y: 0 }, 0.5, 1 / 60);
    expect(fresh[0].x).toBeGreaterThan(fresh[1].x);
  });
});

describe('colors', () => {
  it('sets alpha on hex colors and scales it on rgba colors', () => {
    expect(withAlpha('#A87A22', 0.5)).toBe('rgba(168, 122, 34, 0.5)');
    expect(withAlpha('rgba(255, 250, 225, 0.84)', 0.5)).toBe('rgba(255, 250, 225, 0.42)');
    expect(withAlpha('rgb(1, 2, 3)', 0.25)).toBe('rgba(1, 2, 3, 0.25)');
    expect(withAlpha('red', 0.5)).toBe('red');
  });

  it('clamps to 0–1', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});

describe('label boxes', () => {
  it('sit beside the dot toward the middle of the screen, and flip near the edge', () => {
    const inward = labelBox('bottom-right', { x: 1000, y: 500 }, 'Read ›', 1280, 9);
    expect(inward.side).toBe(-1);
    expect(inward.x + inward.w).toBe(1000 - 15);
    expect(inward.y).toBe(486);
    const flipped = labelBox('bottom-right', { x: 40, y: 500 }, 'A long label here', 400, 9);
    expect(flipped.side).toBe(1);
    expect(flipped.x).toBe(55);
    const left = labelBox('bottom-left', { x: 100, y: 500 }, 'Tabs', 1280, 9);
    expect(left.side).toBe(1);
  });

  it('hit-tests points with a little slack', () => {
    const box = { x: 10, y: 10, w: 100, h: 28 };
    expect(inBox(box, { x: 50, y: 20 })).toBe(true);
    expect(inBox(box, { x: 8, y: 20 })).toBe(true);
    expect(inBox(box, { x: 0, y: 20 })).toBe(false);
    expect(inBox(box, { x: 50, y: 45 })).toBe(false);
  });
});

describe('exits', () => {
  it('ease like the CSS curves they name', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const u of [0, 0.1, 0.25, 0.5, 0.8, 1]) expect(linear(u)).toBeCloseTo(u, 5);
    // CSS ease-in-out is symmetric about the middle.
    const inOut = cubicBezier(0.42, 0, 0.58, 1);
    expect(inOut(0.5)).toBeCloseTo(0.5, 5);
    expect(inOut(0.2) + inOut(0.8)).toBeCloseTo(1, 5);
    // Exits start slowly and speed up; bursts start fast.
    expect(EXIT(0.25)).toBeLessThan(0.1);
    expect(BURST(0.25)).toBeGreaterThan(0.5);
    for (const ease of [EXIT, BURST, inOut]) {
      let prev = 0;
      for (let u = 0; u <= 1.0001; u += 0.01) {
        const y = ease(u);
        expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = y;
      }
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
    }
  });

  const tw: Tween = {
    t0: 10,
    dur: 0.2,
    ease: cubicBezier(0, 0, 1, 1),
    from: { x: 0, y: 0, s: 1, r: 0, o: 1 },
    to: { x: -100, y: 50, s: 0.15, r: 0, o: 0 },
  };

  it('move from one pose to the other over their duration', () => {
    expect(poseAt(tw, 9)).toEqual(tw.from);
    expect(poseAt(tw, 10.1).x).toBeCloseTo(-50, 5);
    expect(poseAt(tw, 10.1).o).toBeCloseTo(0.5, 5);
    const end = poseAt(tw, 11);
    for (const k of ['x', 'y', 's', 'r', 'o'] as const) expect(end[k]).toBeCloseTo(tw.to[k], 9);
    expect(tweenDone(tw, 10.19)).toBe(false);
    expect(tweenDone(tw, 10.201)).toBe(true);
  });

  it('report how fast they are going, so an element taking over carries on smoothly', () => {
    const { pose, vel } = tweenAt(tw, 10.1);
    expect(pose.x).toBeCloseTo(-50, 5);
    expect(vel.x).toBeCloseTo(-500, 3); // 100 px in 0.2 s
    expect(vel.o).toBeCloseTo(-5, 3);
    // A spring started from that pose and velocity keeps moving the same way at first, then returns.
    const s = { x: pose.x, v: vel.x };
    stepSpring(s, 0, POP, 1 / 60);
    expect(s.x).toBeLessThan(pose.x);
    for (let i = 0; i < 120; i++) stepSpring(s, 0, POP, 1 / 60);
    expect(Math.abs(s.x)).toBeLessThan(0.05);
  });
});
