// Motion for the corner menus: springs, proximity falloff, magnetic pull, and the shapes the web
// engine (engine.web.ts) writes to the page each frame. Pure functions, unit-tested.

import type { Corner, Point } from './geometry';

export interface Spring {
  x: number;
  v: number;
}

/** Stiffness and damping (per second). Damping below 2·√k overshoots a little before settling. */
export interface SpringConfig {
  k: number;
  c: number;
}

/** Entrances: quick, with a small overshoot so items pop into place. */
export const POP: SpringConfig = { k: 430, c: 24 };
/** Hover, magnetism, idle drift: responsive, barely overshoots. */
export const FOLLOW: SpringConfig = { k: 320, c: 32 };
/** Opacity, glow, the corner dot swelling: smooth, no overshoot. */
export const SOFT: SpringConfig = { k: 190, c: 28 };
/** A dragged sphere trailing the pointer. */
export const DRAG: SpringConfig = { k: 900, c: 56 };

export const spring = (x: number): Spring => ({ x, v: 0 });

/**
 * Advances a damped spring toward `target` by `dt` seconds (semi-implicit Euler in small fixed
 * substeps, so it stays stable at any frame rate). Mutates `s`; returns true while still moving.
 */
export function stepSpring(s: Spring, target: number, cfg: SpringConfig, dt: number, eps = 0.001): boolean {
  const steps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (cfg.k * (target - s.x) - cfg.c * s.v) * h;
    s.x += s.v * h;
  }
  if (Math.abs(target - s.x) < eps && Math.abs(s.v) < eps * 10) {
    s.x = target;
    s.v = 0;
    return false;
  }
  return true;
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const clamp01 = (n: number) => clamp(n, 0, 1);

export function smoothstep(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

/** 1 within `inner` px, falling smoothly to 0 at `radius` px. */
export function proximity(distance: number, radius: number, inner = 0): number {
  if (!Number.isFinite(distance)) return 0;
  return smoothstep(1 - (distance - inner) / Math.max(1, radius - inner));
}

/**
 * Offset that leans an element toward the pointer: a fraction of the gap, never more than `max` px,
 * scaled by `strength` (0–1).
 */
export function magnet(from: Point, pointer: Point, strength: number, max: number): Point {
  const dx = pointer.x - from.x;
  const dy = pointer.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.001 || strength <= 0) return { x: 0, y: 0 };
  const m = Math.min(max, d * 0.3) * strength;
  return { x: (dx / d) * m, y: (dy / d) * m };
}

/** Gentle idle drift (px), different for every phase so neighbors never move in step. */
export function drift(t: number, phase: number, amp: number): Point {
  return {
    x: Math.sin(t * 1.1 + phase) * amp,
    y: Math.cos(t * 1.37 + phase * 1.7) * amp,
  };
}

/** Lines are bars this many px wide, stretched by scaleX. */
export const LINE_BASE = 100;

/** CSS transform that lays a LINE_BASE-wide bar (transform-origin: left center) from `a` to `b`. */
export function lineTransform(a: Point, b: Point): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return `translate(${a.x.toFixed(2)}px, ${a.y.toFixed(2)}px) rotate(${deg.toFixed(3)}deg) scaleX(${(len / LINE_BASE).toFixed(4)})`;
}

/** Transform for an element that floats around its resting place. */
export function itemTransform(dx: number, dy: number, scale: number, rotate = 0): string {
  const r = rotate ? ` rotate(${rotate.toFixed(2)}deg)` : '';
  return `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)${r} scale(${Math.max(0, scale).toFixed(4)})`;
}

/**
 * Where the corner dot's preview dots sit: `count` points fanned along the first ring's angles,
 * `dist` px out, relative to the corner origin.
 */
export function previewPoints(corner: Corner, angles: number[], dist: number): Point[] {
  return angles.map((a) => {
    const rad = (a * Math.PI) / 180;
    return { x: (corner === 'bottom-right' ? -1 : 1) * Math.cos(rad) * dist, y: -Math.sin(rad) * dist };
  });
}

/**
 * Moves each point of a trail toward the one ahead of it (the first toward `head`), frame-rate
 * independent. `rate` is the share of the gap closed per 1/60 s.
 */
export function followTrail(points: Point[], head: Point, rate: number, dt: number) {
  const k = 1 - Math.pow(1 - rate, dt * 60);
  let lead = head;
  for (const p of points) {
    p.x += (lead.x - p.x) * k;
    p.y += (lead.y - p.y) * k;
    lead = p;
  }
}

/** "#A87A22" or "rgba(r, g, b, a)" with its alpha replaced (hex) or multiplied (rgba) by `alpha`. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgba = /^rgba?\(([^,]+),([^,]+),([^,)]+)(?:,([^)]+))?\)$/.exec(color.replace(/\s/g, ''));
  if (rgba) {
    const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${+(a * alpha).toFixed(3)})`;
  }
  return color;
}

// What CornerMenu tells the engine each render.

export interface MotionItem {
  /** Unique per placement: `${ring}-${id}`. */
  key: string;
  id: string;
  ring: number;
  angle: number;
  /** Resting center. */
  rest: Point;
  /** Key of the parent item, for items in a child arc. */
  parent: string | null;
  /** Position within its arc, for the staggered entrance. */
  order: number;
  /** Diameter of the dot or sphere. */
  size: number;
  /** The label pill beside a dot, when it's showing: its box, and which side of the dot it's on. */
  label?: { x: number; y: number; w: number; h: number; side: 1 | -1 };
}

export interface MotionState {
  open: boolean;
  variant: 'menu' | 'tabs';
  corner: Corner;
  origin: Point;
  items: MotionItem[];
  /** The item the gesture is on (CornerMenu's hover), which is what a release would choose. */
  hover: string | null;
  path: string[];
  /** A tab sphere being dragged, and whether it's far enough out to close. */
  drag: { id: string; off: boolean } | null;
  /** Angles of the first ring, where the corner dot's preview dots point. */
  previewAngles: number[];
}

export interface MotionRoots {
  overlay: unknown;
  ghosts: unknown;
  hint: unknown;
}

export interface RadialMotion {
  /** Called after every render: picks up new and removed elements and the current state. */
  sync(state: MotionState, roots: MotionRoots): void;
  /** The chosen item bursts as the menu closes. */
  selected(id: string): void;
  /** A tab dragged off its arc pops as it closes. */
  dismissed(id: string): void;
  destroy(): void;
}
