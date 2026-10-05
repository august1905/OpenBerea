// Motion for the corner menus on the web. One requestAnimationFrame loop per menu springs every
// dot, line, and label toward where it wants to be, and reacts to the pointer before any press:
//
//   - Closed: the corner dot breathes, sends out a faint ping now and then, and swells and leans
//     toward a pointer or finger that comes near, while preview dots fan out along the arc.
//   - Opening: items fly out from those preview dots with a staggered spring, lines stretch with
//     them, labels slide in, and dotted ring guides grow from the corner.
//   - Open: items drift gently; the ones near the pointer magnify and lean in like a dock; the one a
//     release would choose fills with gold, glows, and shows its icon; light runs along the lines
//     of the open path; a swipe leaves a comet trail.
//   - Closing: the chosen item bursts, the rest fall back into the corner.
//   - Tabs: spheres trail a drag with a little tilt, shake when far enough out to close, and pop.
//
// React renders the structure and resting layout. This file writes only `transform`, `opacity`,
// and a few decorative styles, on elements tagged with data-m, so the two never fight over a
// property. Removed elements are cloned into a ghost layer and animated out there; React drops the
// originals at once, so tests and assistive tech never see them.
//
// Hovering opens and closes menus and arcs often, so any of this can be cut short. An element that
// comes back while its ghost is still leaving (the menu reopened, an arc hovered again) takes over
// from the ghost: it carries on from where the ghost is, at the speed it was going, and springs
// back to its place, rather than starting its entrance over beside a fading copy.
//
// prefers-reduced-motion: no drift, magnetism, scaling, trails, or looping animations; fades only.

import { domNode } from '@/lib/platform/dom';

import type { Point } from './geometry';
import {
  BURST,
  clamp,
  clamp01,
  DRAG,
  drift,
  EASE_OUT,
  EXIT,
  FOLLOW,
  followTrail,
  itemTransform,
  lineTransform,
  magnet,
  type MotionItem,
  type MotionRoots,
  type MotionState,
  POP,
  type Pose,
  poseAt,
  previewPoints,
  proximity,
  type RadialMotion,
  SOFT,
  type Spring,
  spring,
  stepSpring,
  type Tween,
  tweenAt,
  tweenDone,
  withAlpha,
} from './motion';

const KEYFRAMES = `
@keyframes ob-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
@keyframes ob-ping { 0% { transform: scale(0.7); opacity: 0.5; } 24%, 100% { transform: scale(3); opacity: 0; } }
@keyframes ob-shimmer { from { background-position: 130% 0; } to { background-position: -30% 0; } }
@keyframes ob-ripple { from { transform: scale(0.4); opacity: 0.6; } to { transform: scale(7); opacity: 0; } }
@keyframes ob-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { [data-ob-anim] { animation: none !important; } }
`;

const SHIMMER =
  'linear-gradient(90deg, rgba(255,250,225,0) 0%, rgba(255,250,225,0) 38%, rgba(255,250,225,0.95) 50%, rgba(255,250,225,0) 62%, rgba(255,250,225,0) 100%)';

type Kind =
  | 'veil'
  | 'origin'
  | 'ring'
  | 'line'
  | 'dot'
  | 'label'
  | 'crumb'
  | 'trail'
  | 'hint-core'
  | 'hint-halo'
  | 'hint-ghost'
  | 'hint-breath'
  | 'hint-ping';

/** Parts styled through their parent entry rather than registered on their own. */
const PARTS = new Set(['glow', 'fill', 'icon', 'ripple', 'spin']);
const HINT = new Set<Kind>(['hint-core', 'hint-halo', 'hint-ghost', 'hint-breath', 'hint-ping']);

interface Entry {
  kind: Kind;
  key: string;
  el: HTMLElement;
  born: number;
  delay: number;
  phase: number;
  /** Offset from rest (px), scale, opacity, heat (0–1: how strongly the pointer is on it), tilt. */
  x: Spring;
  y: Spring;
  s: Spring;
  o: Spring;
  h: Spring;
  r: Spring;
  /** Labels: +1 when the pill sits right of its dot, −1 left. */
  side: 1 | -1;
  /** Trail and preview dots: position in the row; trail: diameter. */
  index: number;
  size: number;
  parts: { glow?: HTMLElement | null; fill?: HTMLElement | null; icon?: HTMLElement | null; pill?: HTMLElement | null };
  /** Last item data seen, kept for the exit after the item is gone. */
  item?: MotionItem;
  /** Lines: last endpoints; whether the shimmer is on. */
  ends?: { a: Point; b: Point };
  shimmer: boolean;
  started: boolean;
  /** Rings: when the slow spin began, so a ring that takes over from its ghost keeps its angle. */
  since: number;
}

/** A removed element animating out on the ghost layer. */
interface Ghost {
  /** `${kind}:${key}`: a new element with the same id takes over from here (see adopt). */
  id: string;
  kind: Kind;
  el: HTMLElement;
  tw: Tween;
  /** The transform for a pose; null keeps the one the element had. */
  transform: ((p: Pose) => string) | null;
  /** Dots: the resting place the pose is relative to, and how lit the dot was. */
  rest?: Point;
  heat?: number;
  /** Breadcrumbs: only the same text takes over (a different path cross-fades). */
  text?: string;
  since: number;
}

/** Kinds whose new element takes over from its ghost. */
const ADOPT = new Set<Kind>(['veil', 'origin', 'ring', 'line', 'dot', 'label', 'crumb']);

function ensureKeyframes() {
  if (typeof document === 'undefined' || document.getElementById('ob-motion')) return;
  const style = document.createElement('style');
  style.id = 'ob-motion';
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
}

const written = new WeakMap<HTMLElement, Record<string, string>>();

/** Sets an inline style, skipping the write when the value hasn't changed. */
function put(el: HTMLElement | null | undefined, prop: string, value: string) {
  if (!el) return;
  let cache = written.get(el);
  if (!cache) written.set(el, (cache = {}));
  if (cache[prop] === value) return;
  cache[prop] = value;
  el.style.setProperty(prop, value);
}

const fmt = (n: number) => clamp01(n).toFixed(3);

export function createMotion(): RadialMotion {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { sync() {}, selected() {}, dismissed() {}, destroy() {} };
  }
  ensureKeyframes();

  const entries = new Map<string, Entry>();
  let state: MotionState | null = null;
  let byKey = new Map<string, MotionItem>();
  let ghosts: HTMLElement | null = null;
  let overlay: HTMLElement | null = null;
  let pointer: Point | null = null;
  let down = false;
  /** A press, or a finger steering a menu it opened with an edge swipe. */
  const pressed = () => down || !!state?.tracking;
  const vel = { x: 0, y: 0 };
  let lastPointer: { p: Point; t: number } | null = null;
  let raf = 0;
  let lastFrame = 0;
  let chosen: string | null = null;
  let popped: string | null = null;
  let previewDist = 10;
  let attached = false;
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!media?.matches;
  const hint = { p: spring(0), hv: spring(0), press: spring(0), mx: spring(0), my: spring(0), vis: spring(1) };
  const trail: Point[] = [];
  const leaving: Ghost[] = [];
  const now = () => performance.now() / 1000;

  // Pointer input, from the whole page: the corner dot reacts before anything is pressed.
  const onMove = (e: PointerEvent) => {
    const p = { x: e.clientX, y: e.clientY };
    const t = now();
    if (lastPointer) {
      const dt = Math.max(0.004, t - lastPointer.t);
      vel.x = vel.x * 0.6 + ((p.x - lastPointer.p.x) / dt) * 0.4;
      vel.y = vel.y * 0.6 + ((p.y - lastPointer.p.y) / dt) * 0.4;
    }
    lastPointer = { p, t };
    pointer = p;
    wake();
  };
  const onDown = (e: PointerEvent) => {
    down = true;
    onMove(e);
    trail.splice(0, trail.length);
  };
  const onUp = (e: PointerEvent) => {
    down = false;
    // A lifted finger isn't anywhere; a mouse still hovers.
    if (e.pointerType !== 'mouse') pointer = null;
    wake();
  };
  // While a finger scrolls the page the browser cancels its pointer events, but touch events keep
  // coming, so the corner dot can still react to a finger passing near it.
  const onTouch = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) {
      pointer = null;
      wake();
      return;
    }
    pointer = { x: touch.clientX, y: touch.clientY };
    wake();
  };
  const onLeave = () => {
    pointer = null;
    down = false;
    wake();
  };
  const onMedia = () => {
    reduced = !!media?.matches;
    wake();
  };
  const opts = { capture: true, passive: true } as const;
  const attach = () => {
    if (attached) return;
    attached = true;
    window.addEventListener('pointermove', onMove, opts);
    window.addEventListener('pointerdown', onDown, opts);
    window.addEventListener('pointerup', onUp, opts);
    window.addEventListener('pointercancel', onUp, opts);
    window.addEventListener('touchmove', onTouch, opts);
    window.addEventListener('touchend', onTouch, opts);
    window.addEventListener('blur', onLeave);
    document.documentElement.addEventListener('mouseleave', onLeave);
    media?.addEventListener?.('change', onMedia);
  };
  const detach = () => {
    if (!attached) return;
    attached = false;
    window.removeEventListener('pointermove', onMove, opts);
    window.removeEventListener('pointerdown', onDown, opts);
    window.removeEventListener('pointerup', onUp, opts);
    window.removeEventListener('pointercancel', onUp, opts);
    window.removeEventListener('touchmove', onTouch, opts);
    window.removeEventListener('touchend', onTouch, opts);
    window.removeEventListener('blur', onLeave);
    document.documentElement.removeEventListener('mouseleave', onLeave);
    media?.removeEventListener?.('change', onMedia);
  };

  const wake = () => {
    if (raf) return;
    lastFrame = performance.now();
    raf = requestAnimationFrame(loop);
  };
  const loop = (ms: number) => {
    raf = 0;
    const dt = clamp((ms - lastFrame) / 1000, 0.001, 1 / 30);
    lastFrame = ms;
    let busy = false;
    try {
      busy = tick(ms / 1000, dt);
    } catch {
      busy = false;
    }
    if (busy) raf = requestAnimationFrame(loop);
  };

  /** Where an item is right now (its resting place plus its springs). */
  const live = (key: string | null | undefined): Point => {
    const st = state!;
    if (!key) return st.origin;
    const e = entries.get(`dot:${key}`);
    const item = byKey.get(key) ?? e?.item;
    if (!item) return st.origin;
    return e ? { x: item.rest.x + e.x.x, y: item.rest.y + e.y.x } : item.rest;
  };

  /** Where a new item flies in from: its preview dot (first ring) or its parent (child arcs). */
  const startPoint = (item: MotionItem): Point => {
    const st = state!;
    if (item.parent) return live(item.parent);
    const [p] = previewPoints(st.corner, [item.angle], previewDist);
    return { x: st.origin.x + p.x, y: st.origin.y + p.y };
  };

  const makeEntry = (kind: Kind, key: string, el: HTMLElement): Entry => ({
    kind,
    key,
    el,
    born: now(),
    delay: 0,
    phase: Math.random() * Math.PI * 2,
    x: spring(0),
    y: spring(0),
    s: spring(1),
    o: spring(1),
    h: spring(0),
    r: spring(0),
    side: 1,
    index: Number(key) || 0,
    size: Number(el.dataset.s) || 0,
    parts: {},
    shimmer: false,
    started: false,
    since: now(),
  });

  const loopAnim = (el: HTMLElement | null | undefined, value: string) => {
    if (!el) return;
    el.dataset.obAnim = '';
    el.style.animation = reduced ? 'none' : value;
  };

  /** A ring's slow spin, `elapsed` seconds in (a copy of a ring starts its CSS animation over). */
  const spinRing = (root: HTMLElement, index: number, elapsed: number) =>
    loopAnim(
      root.querySelector<HTMLElement>('[data-m="spin"], [data-ob-spin]'),
      `ob-spin ${index % 2 ? 140 : 100}s linear ${(-elapsed).toFixed(2)}s infinite${index % 2 ? ' reverse' : ''}`,
    );

  /** The corner dot's breathing and occasional ping, unless it's hidden. */
  const hintLoops = (e: Entry) => {
    const hidden = !!state?.hintHidden;
    if (e.kind === 'hint-breath') loopAnim(e.el, hidden ? 'none' : 'ob-breathe 4.6s ease-in-out infinite');
    else if (e.kind === 'hint-ping') loopAnim(e.el, hidden ? 'none' : 'ob-ping 7s cubic-bezier(0.2, 0.6, 0.35, 1) 1.5s infinite');
  };

  const init = (e: Entry) => {
    const st = state!;
    const part = (m: string) => e.el.querySelector<HTMLElement>(`[data-m="${m}"]`);
    switch (e.kind) {
      case 'veil':
        e.o = spring(0);
        // Densest around the corner, so the menu stands out and the far page stays in view.
        put(e.el, 'mask-image', `radial-gradient(circle farthest-corner at ${st.origin.x}px ${st.origin.y}px, #000 0%, #000 40%, rgba(0,0,0,0.6) 100%)`);
        put(e.el, '-webkit-mask-image', `radial-gradient(circle farthest-corner at ${st.origin.x}px ${st.origin.y}px, #000 0%, #000 40%, rgba(0,0,0,0.6) 100%)`);
        break;
      case 'origin':
        e.s = spring(reduced ? 1 : 0);
        loopAnim(part('ripple'), 'ob-ripple 0.8s cubic-bezier(0.2, 0.7, 0.3, 1) both');
        break;
      case 'ring': {
        e.s = spring(reduced ? 1 : 0.55);
        e.o = spring(0);
        e.delay = reduced ? 0 : e.index * 0.05;
        const o = `${st.origin.x}px ${st.origin.y}px`;
        put(e.el, 'transform-origin', o);
        const spin = part('spin');
        put(spin, 'transform-origin', o);
        if (spin) spin.dataset.obSpin = '';
        spinRing(e.el, e.index, 0);
        break;
      }
      case 'dot': {
        e.parts = { glow: part('glow'), fill: part('fill'), icon: part('icon') };
        const item = byKey.get(e.key);
        if (item) {
          e.item = item;
          const from = startPoint(item);
          e.x = spring(reduced ? 0 : from.x - item.rest.x);
          e.y = spring(reduced ? 0 : from.y - item.rest.y);
          e.s = spring(reduced ? 1 : 0.2);
          e.o = spring(0);
          e.delay = reduced ? 0 : item.order * (item.ring === 0 ? 0.034 : 0.028);
        }
        put(e.el, 'will-change', 'transform, opacity');
        break;
      }
      case 'label': {
        const item = byKey.get(e.key);
        const dot = entries.get(`dot:${e.key}`);
        e.side = e.el.dataset.d === 'l' ? -1 : 1;
        e.o = spring(0);
        e.x = spring(reduced ? 0 : -e.side * 12);
        e.delay = (dot && !dot.started ? dot.delay : 0) + (reduced || !item ? 0 : 0.07);
        e.parts = { pill: e.el.firstElementChild as HTMLElement | null };
        put(e.el, 'transform-origin', e.side > 0 ? '0% 50%' : '100% 50%');
        break;
      }
      case 'line':
        put(e.el, 'transform-origin', '0 50%');
        break;
      case 'crumb':
        e.o = spring(0);
        e.y = spring(reduced ? 0 : 10);
        break;
      case 'trail':
        e.o = spring(0);
        break;
      case 'hint-breath':
      case 'hint-ping':
        hintLoops(e);
        break;
    }
  };

  const register = (el: HTMLElement) => {
    const kind = el.dataset.m as Kind | undefined;
    if (!kind || PARTS.has(kind)) return;
    const key = el.dataset.k ?? '';
    const id = `${kind}:${key}`;
    const old = entries.get(id);
    if (old?.el === el) return;
    if (old) {
      entries.delete(id);
      if (!old.el.isConnected) leave(old);
    }
    const e = makeEntry(kind, key, el);
    entries.set(id, e);
    init(e);
    const t = now();
    if (ADOPT.has(kind)) {
      for (let i = leaving.length - 1; i >= 0; i--) {
        if (leaving[i].id !== id) continue;
        adopt(e, leaving[i], t);
        break;
      }
    }
    paint(e, t, 0);
  };

  const dropGhost = (g: Ghost) => {
    g.el.remove();
    const i = leaving.indexOf(g);
    if (i >= 0) leaving.splice(i, 1);
  };

  /** Animates a removed element out from a clone in the ghost layer. */
  const leave = (e: Entry) => {
    const layer = ghosts;
    const st = state;
    if (!layer || !st || HINT.has(e.kind) || e.kind === 'trail') return;
    const clone = e.el.cloneNode(true) as HTMLElement;
    for (const n of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]) {
      n.removeAttribute('data-testid');
      n.removeAttribute('id');
      n.removeAttribute('data-m');
      n.removeAttribute('data-k');
    }
    clone.style.pointerEvents = 'none';
    layer.appendChild(clone);
    if (e.kind === 'ring') spinRing(clone, e.index, now() - e.since);
    const closing = !st.open;
    const id = e.item?.id;
    const still: Pose = { x: 0, y: 0, s: 1, r: 0, o: clamp01(Number.parseFloat(e.el.style.opacity || '1')) };
    let from = still;
    let to: Pose = { ...still, o: 0 };
    let dur = 0.2;
    let ease = EXIT;
    let transform: Ghost['transform'] = null;
    const ghost: Omit<Ghost, 'tw' | 'transform'> = { id: `${e.kind}:${e.key}`, kind: e.kind, el: clone, since: e.since };
    if (e.kind === 'dot') {
      ghost.rest = e.item?.rest ?? st.origin;
      ghost.heat = e.h.x;
    }
    if (e.kind === 'crumb') ghost.text = e.el.textContent ?? '';
    if (reduced) dur = 0.14;
    else if (e.kind === 'dot') {
      const rest = ghost.rest!;
      from = { x: e.x.x, y: e.y.x, s: e.s.x, r: e.r.x, o: e.o.x };
      transform = (p) => itemTransform(p.x, p.y, p.s, p.r);
      if (id && (id === chosen || id === popped)) {
        to = { ...from, s: from.s * (id === chosen ? 2.4 : 1.7), o: 0 };
        dur = id === chosen ? 0.42 : 0.3;
        ease = BURST;
      } else {
        const target = closing || !e.item?.parent ? st.origin : live(e.item.parent);
        to = { x: target.x - rest.x, y: target.y - rest.y, s: 0.15, r: 0, o: 0 };
        dur = 0.2 + (e.item?.order ?? 0) * 0.016;
      }
    } else if (e.kind === 'line') {
      if (e.ends && !(id && id === chosen)) {
        // The pose's x/y is the line's far end, which draws back to its start.
        const { a, b } = e.ends;
        from = { ...still, x: b.x, y: b.y };
        to = { ...from, x: a.x + (b.x - a.x) * 0.001, y: a.y + (b.y - a.y) * 0.001, o: 0 };
        transform = (p) => lineTransform(a, p);
      }
      dur = id && id === chosen ? 0.36 : 0.2;
    } else if (e.kind === 'label') dur = 0.11;
    else if (e.kind === 'origin' || e.kind === 'ring') {
      from = { ...still, s: e.s.x };
      to = { ...from, s: e.kind === 'origin' ? 0 : 0.7, o: 0 };
      transform = (p) => `scale(${Math.max(0, p.s).toFixed(4)})`;
    } else if (e.kind === 'veil') {
      dur = 0.26;
      ease = EASE_OUT;
    } else if (e.kind === 'crumb') dur = 0.12;
    leaving.push({ ...ghost, tw: { t0: now(), dur, ease, from, to }, transform });
  };

  /**
   * A new element takes over from its own ghost (the same item coming back while it was still
   * leaving): it starts where the ghost is, moving as the ghost was, and the ghost goes. Its
   * entrance needs no delay, since it's already on screen.
   */
  const adopt = (e: Entry, g: Ghost, t: number) => {
    if (e.kind === 'crumb' && g.text !== (e.el.textContent ?? '')) return;
    const { pose, vel } = tweenAt(g.tw, t);
    switch (e.kind) {
      case 'dot': {
        const item = byKey.get(e.key);
        if (!item || !g.rest) return;
        // Relative to the new resting place, in case it moved.
        e.x = { x: pose.x + g.rest.x - item.rest.x, v: vel.x };
        e.y = { x: pose.y + g.rest.y - item.rest.y, v: vel.y };
        e.s = { x: pose.s, v: vel.s };
        e.r = { x: pose.r, v: vel.r };
        e.h = spring(g.heat ?? 0);
        break;
      }
      case 'origin':
        e.s = { x: pose.s, v: vel.s };
        // The ripple marks an opening; this is the same opening carrying on.
        loopAnim(e.el.querySelector<HTMLElement>('[data-m="ripple"]'), 'none');
        break;
      case 'ring':
        e.s = { x: pose.s, v: vel.s };
        e.since = g.since;
        spinRing(e.el, e.index, t - g.since);
        break;
      case 'label':
      case 'crumb':
        e.x = spring(0);
        e.y = spring(0);
        break;
    }
    e.o = spring(pose.o);
    e.delay = 0;
    e.started = true;
    dropGhost(g);
  };

  const paintGhost = (g: Ghost, t: number): boolean => {
    const p = poseAt(g.tw, t);
    if (g.transform) put(g.el, 'transform', g.transform(p));
    put(g.el, 'opacity', fmt(p.o));
    if (!tweenDone(g.tw, t)) return true;
    dropGhost(g);
    return false;
  };

  /** The item the pointer is on: the gesture's target while pressed; nearest dot or label on hover. */
  const findHot = (st: MotionState, p: Point | null): string | null => {
    if (!st.open) return null;
    if (pressed() || st.drag) return st.items.find((i) => i.id === st.hover)?.key ?? null;
    if (!p) return null;
    let best: string | null = null;
    let bestD = Infinity;
    for (const it of st.items) {
      const d = Math.hypot(it.rest.x - p.x, it.rest.y - p.y);
      const reach = it.size / 2 + (st.variant === 'tabs' ? 8 : 22);
      if (d <= reach && d < bestD) {
        best = it.key;
        bestD = d;
      }
    }
    if (best) return best;
    for (const it of st.items) {
      const l = it.label;
      if (l && p.x >= l.x - 4 && p.x <= l.x + l.w + 4 && p.y >= l.y - 4 && p.y <= l.y + l.h + 4) return it.key;
    }
    return null;
  };

  let hot: string | null = null;
  let deepest = 0;

  const paint = (e: Entry, t: number, dt: number): boolean => {
    const st = state!;
    const P = pointer;
    let busy = false;
    const step = (s: Spring, target: number, cfg = FOLLOW, eps = 0.001) => {
      if (dt > 0 && stepSpring(s, target, cfg, dt, eps)) busy = true;
    };
    switch (e.kind) {
      case 'dot': {
        const item = byKey.get(e.key);
        if (!item) return false;
        e.item = item;
        const age = t - e.born;
        if (age >= e.delay) {
          e.started = true;
          const isHot = hot === item.key;
          const dragging = st.drag?.id === item.id;
          const d = P ? Math.hypot(P.x - item.rest.x, P.y - item.rest.y) : Infinity;
          const tabs = st.variant === 'tabs';
          const prox = reduced ? 0 : proximity(d, tabs ? 150 : 120, item.size / 2);
          const dimmed = item.ring < deepest && !st.path.includes(item.id);
          let tx = 0;
          let ty = 0;
          let ts = 1;
          let tr = 0;
          let cfg = age - e.delay < 0.7 ? POP : FOLLOW;
          if (dragging && P) {
            tx = P.x - item.rest.x;
            ty = P.y - item.rest.y;
            cfg = DRAG;
            if (!reduced) {
              tr = clamp(vel.x * 0.025, -16, 16) + (st.drag?.off ? Math.sin(t * 32) * 6 : 0);
              ts = st.drag?.off ? 0.9 : 1.1;
            }
          } else if (!reduced) {
            const f = drift(t, e.phase, tabs ? 2.2 : 1.4);
            const m = P ? magnet(item.rest, P, isHot ? 1 : prox * 0.8, isHot ? 9 : 6) : { x: 0, y: 0 };
            tx = f.x + m.x;
            ty = f.y + m.y;
            ts = tabs ? 1 + 0.1 * prox + (isHot ? 0.1 : 0) : 1 + 0.28 * prox + (isHot ? 0.5 : 0);
            if (dimmed && !isHot) ts *= 0.86;
          }
          if (reduced && dragging) {
            e.x.x = tx;
            e.y.x = ty;
          }
          step(e.x, tx, cfg, 0.02);
          step(e.y, ty, cfg, 0.02);
          step(e.s, ts, cfg);
          step(e.r, tr, FOLLOW, 0.01);
          step(e.o, 1, SOFT);
          step(e.h, isHot ? 1 : prox * 0.22, SOFT);
        } else busy = true;
        put(e.el, 'transform', itemTransform(e.x.x, e.y.x, e.s.x, e.r.x));
        put(e.el, 'opacity', fmt(e.o.x));
        const h = clamp01(e.h.x);
        put(e.parts.glow, 'opacity', fmt(h * 0.9));
        put(e.parts.glow, 'transform', `scale(${(reduced ? 1 : 0.55 + 0.6 * h).toFixed(3)})`);
        put(e.parts.fill, 'opacity', fmt(h));
        put(e.parts.icon, 'opacity', fmt((h - 0.4) / 0.6));
        put(e.parts.icon, 'transform', `scale(${(0.6 + 0.4 * h).toFixed(3)})`);
        return busy;
      }
      case 'label': {
        const item = byKey.get(e.key);
        if (!item) return false;
        const dot = entries.get(`dot:${e.key}`);
        if (t - e.born >= e.delay) {
          step(e.o, 1, SOFT);
          step(e.x, 0, FOLLOW, 0.02);
        } else busy = true;
        const ds = dot ? dot.s.x : 1;
        const heat = dot ? clamp01(dot.h.x) : 0;
        // Ride along with the dot, and step aside as it swells.
        const lx = (dot?.x.x ?? 0) + e.side * Math.max(0, ds - 1) * (item.size / 2) + e.x.x;
        const ly = dot?.y.x ?? 0;
        put(e.el, 'transform', itemTransform(lx, ly, reduced ? 1 : 1 + 0.06 * heat));
        put(e.el, 'opacity', fmt(e.o.x * (dot ? Math.min(1, dot.o.x * 1.5) : 1)));
        const glow = Math.round(heat * 20) / 20;
        put(e.parts.pill, 'box-shadow', glow ? `0 4px 14px ${withAlpha(e.el.dataset.g ?? '#A87A22', 0.3 * glow)}` : 'none');
        return busy;
      }
      case 'line': {
        const item = byKey.get(e.key);
        if (!item) return false;
        e.item = item;
        const a = item.parent ? live(item.parent) : st.origin;
        const b = live(item.key);
        e.ends = { a, b };
        const dot = entries.get(`dot:${e.key}`);
        put(e.el, 'transform', lineTransform(a, b));
        put(e.el, 'opacity', fmt(dot ? dot.o.x : 1));
        const on = !reduced && (st.path.includes(item.id) || hot === item.key);
        if (on !== e.shimmer) {
          e.shimmer = on;
          put(e.el, 'background-image', on ? SHIMMER : 'none');
          put(e.el, 'background-size', on ? '220% 100%' : 'auto');
          e.el.dataset.obAnim = '';
          put(e.el, 'animation', on ? 'ob-shimmer 1.3s linear infinite' : 'none');
        }
        return false;
      }
      case 'veil':
        step(e.o, 1, SOFT);
        put(e.el, 'opacity', fmt(e.o.x));
        return busy;
      case 'origin':
        step(e.s, pressed() && !reduced ? 1.2 : 1, POP);
        step(e.o, 1, SOFT);
        put(e.el, 'transform', `scale(${e.s.x.toFixed(3)})`);
        put(e.el, 'opacity', fmt(e.o.x));
        return busy;
      case 'ring':
        if (t - e.born >= e.delay) {
          step(e.s, 1, POP);
          step(e.o, 1, SOFT);
        } else busy = true;
        put(e.el, 'transform', `scale(${e.s.x.toFixed(4)})`);
        put(e.el, 'opacity', fmt(e.o.x));
        return busy;
      case 'crumb':
        step(e.o, 1, SOFT);
        step(e.y, 0, POP, 0.02);
        put(e.el, 'transform', itemTransform(0, e.y.x, 1));
        put(e.el, 'opacity', fmt(e.o.x));
        return busy;
      case 'trail': {
        const p = trail[e.index];
        const on = st.open && pressed() && !!P && !reduced && !!p;
        step(e.o, on ? (1 - e.index / 12) * 0.6 : 0, SOFT);
        if (p) put(e.el, 'transform', `translate(${(p.x - e.size / 2).toFixed(1)}px, ${(p.y - e.size / 2).toFixed(1)}px)`);
        put(e.el, 'opacity', fmt(e.o.x));
        return busy;
      }
      case 'hint-core':
        put(e.el, 'transform', itemTransform(hint.mx.x, hint.my.x, reduced ? 1 : 1 + 0.85 * hint.p.x + 0.55 * hint.hv.x - 0.28 * hint.press.x));
        // Hands over to the open menu's own corner dot, and back.
        put(e.el, 'opacity', fmt(hint.vis.x));
        return false;
      case 'hint-halo':
        put(e.el, 'transform', itemTransform(hint.mx.x * 0.5, hint.my.x * 0.5, reduced ? 1 : 0.7 + 0.55 * hint.p.x + 0.35 * hint.hv.x));
        put(e.el, 'opacity', fmt(0.5 * hint.p.x + 0.3 * hint.hv.x));
        return false;
      case 'hint-ghost': {
        const angle = st.previewAngles[e.index];
        if (angle === undefined) {
          put(e.el, 'opacity', '0');
          return false;
        }
        const [p] = previewPoints(st.corner, [angle], previewDist);
        put(e.el, 'transform', itemTransform(p.x + hint.mx.x * 0.4, p.y + hint.my.x * 0.4, 0.45 + 0.55 * hint.p.x));
        put(e.el, 'opacity', fmt((hint.p.x * 1.5 - e.index * 0.1) * 0.9));
        return false;
      }
      case 'hint-ping':
        put(e.el, 'visibility', st.open ? 'hidden' : 'visible');
        return false;
      default:
        return false;
    }
  };

  const tick = (t: number, dt: number): boolean => {
    const st = state;
    if (!st) return false;
    let busy = st.open || down;
    const decay = Math.pow(0.02, dt);
    vel.x *= decay;
    vel.y *= decay;
    const P = pointer;
    hot = findHot(st, P);
    deepest = Math.max(0, ...st.items.map((i) => i.ring));
    if (overlay) put(overlay, 'cursor', hot ? 'pointer' : 'default');

    // The corner dot: swells and leans toward a pointer that comes near, squishes when pressed.
    const o = st.origin;
    const d = P && !st.hintHidden ? Math.hypot(P.x - o.x, P.y - o.y) : Infinity;
    const alive = !st.open && !reduced;
    const hs = (s: Spring, target: number, cfg = SOFT, eps = 0.001) => {
      if (stepSpring(s, target, cfg, dt, eps)) busy = true;
    };
    hs(hint.p, alive ? proximity(d, 240, 26) : 0);
    hs(hint.hv, !st.open && d < 30 ? 1 : 0);
    hs(hint.press, down && d < 32 && !reduced ? 1 : 0, FOLLOW);
    hs(hint.vis, st.open ? 0 : 1);
    const m = alive && P ? magnet(o, P, hint.p.x, 10) : { x: 0, y: 0 };
    hs(hint.mx, m.x, FOLLOW, 0.02);
    hs(hint.my, m.y, FOLLOW, 0.02);
    previewDist = 9 + 26 * hint.p.x + 18 * hint.hv.x;

    if (st.open && pressed() && P) {
      while (trail.length < 12) trail.push({ ...P });
      followTrail(trail, P, 0.36, dt);
    }

    // Dots first: lines and labels read their springs.
    for (const e of entries.values()) if (e.kind === 'dot' && paint(e, t, dt)) busy = true;
    for (const e of entries.values()) if (e.kind !== 'dot' && paint(e, t, dt)) busy = true;
    for (const g of [...leaving]) if (paintGhost(g, t)) busy = true;
    return busy;
  };

  return {
    sync(next: MotionState, roots: MotionRoots) {
      attach();
      const hintWas = state?.hintHidden;
      state = next;
      if (hintWas !== undefined && hintWas !== next.hintHidden) for (const e of entries.values()) hintLoops(e);
      byKey = new Map(next.items.map((i) => [i.key, i]));
      // An item whose resting place moved (tabs re-spread after one closes) glides there from where
      // it was, rather than jumping with its new layout.
      for (const e of entries.values()) {
        const item = e.kind === 'dot' ? byKey.get(e.key) : undefined;
        if (!item || !e.item || (item.rest.x === e.item.rest.x && item.rest.y === e.item.rest.y)) continue;
        e.x.x += e.item.rest.x - item.rest.x;
        e.y.x += e.item.rest.y - item.rest.y;
        e.item = item;
      }
      ghosts = domNode(roots.ghosts);
      overlay = domNode(roots.overlay);
      const hintEl = domNode(roots.hint);
      for (const root of [overlay, hintEl]) root?.querySelectorAll<HTMLElement>('[data-m]').forEach(register);
      for (const [id, e] of entries) {
        if (e.el.isConnected) continue;
        entries.delete(id);
        leave(e);
      }
      chosen = null;
      popped = null;
      // Repaint now, before the browser does, so nothing shows a frame out of place.
      const t = now();
      for (const e of entries.values()) if (e.kind === 'dot') paint(e, t, 0);
      for (const e of entries.values()) if (e.kind !== 'dot') paint(e, t, 0);
      wake();
    },
    selected(id: string) {
      chosen = id;
    },
    dismissed(id: string) {
      popped = id;
    },
    destroy() {
      detach();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      for (const g of [...leaving]) dropGhost(g);
    },
  };
}
