import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { t } from '@/i18n';
import { guardCornerZone, onDocumentKey, setPageSelectable } from '@/lib/platform/dom';
import { useTheme } from '@/theme';

import { Icon } from '../Icon';
import { createMotion } from './engine';
import {
  type Corner,
  firstRingAngles,
  hitTest,
  inBox,
  type LabelBox,
  labelBox,
  layoutFor,
  originFor,
  overflowRingAngles,
  type PlacedItem,
  type Point,
  stackedAngles,
  toPolar,
  toScreen,
} from './geometry';
import { LINE_BASE, type MotionItem, type MotionState, withAlpha } from './motion';
import type { RadialNode } from './types';

type Mode = 'closed' | 'swipe' | 'click';

interface Placed extends PlacedItem<RadialNode> {
  /** `${ring}-${id}`: unique per placement. */
  key: string;
  /** Where the connecting line starts (the corner origin or the parent dot). */
  from: Point;
  parentKey: string | null;
  /** Position within its arc. */
  order: number;
}

interface Props {
  corner: Corner;
  variant: 'menu' | 'tabs';
  nodes: RadialNode[];
  /** Prefix for test ids, e.g. "main-menu". */
  testID: string;
}

const TAP_SLOP = 8;
const TAP_MS = 350;
const DRAG_OFF = 78;
const SPHERE = 54;
const DOT = 18;
/** Minimum vertical distance between labelled dots, so labels never overlap. */
const LABEL_GAP = 29;
const DWELL_MS = 260;
const HINT = 56;
const TRAIL = Array.from({ length: 12 }, (_, i) => 9 - i * 0.5);

function place(nodes: RadialNode[], path: string[], corner: Corner, origin: Point, variant: 'menu' | 'tabs', width: number, height: number): Placed[] {
  const layout = layoutFor(width, height, variant);
  const out: Placed[] = [];
  const add = (item: RadialNode, ring: number, angle: number, dist: number, from: Point, parentKey: string | null, order: number) =>
    out.push({ item, ring, angle, point: toScreen(corner, origin, { angle, dist }), from, key: `${ring}-${item.id}`, parentKey, order });
  if (variant === 'tabs') {
    const first = nodes.slice(0, 5);
    const rest = nodes.slice(5);
    firstRingAngles(first.length).forEach((angle, i) => add(first[i], 0, angle, layout.radii[0], origin, null, i));
    overflowRingAngles(rest.length, layout.radii[1], layout.spacing).forEach((angle, i) => add(rest[i], 1, angle, layout.radii[1], origin, null, i + 5));
    return out;
  }
  const top = nodes.slice(0, 5);
  stackedAngles(top.length, layout.radii[0], LABEL_GAP).forEach((angle, i) => add(top[i], 0, angle, layout.radii[0], origin, null, i));
  for (let depth = 0; depth < path.length && depth + 1 < layout.radii.length; depth++) {
    const parent = out.find((p) => p.ring === depth && p.item.id === path[depth]);
    const kids = parent?.item.children?.slice(0, 5);
    if (!parent || !kids?.length) break;
    const r = layout.radii[depth + 1];
    stackedAngles(kids.length, r, LABEL_GAP, parent.angle).forEach((angle, i) => add(kids[i], depth + 1, angle, r, parent.point, parent.key, i));
  }
  return out;
}

const labelText = (node: RadialNode) => `${node.label}${node.active ? ' ✓' : ''}${node.children?.length ? ' ›' : ''}`;

/** Native has no motion engine: lines get their resting transform from React instead. */
function restingLine(a: Point, b: Point): ViewStyle | null {
  if (Platform.OS === 'web') return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return {
    transformOrigin: 'left center',
    transform: [{ translateX: a.x }, { translateY: a.y }, { rotate: `${deg}deg` }, { scaleX: len / LINE_BASE }],
  };
}

/**
 * A quarter-radial marking menu anchored in a screen corner. Press and hold the corner dot and swipe
 * toward an item, or click/tap the dot to open it and tap items (or their labels). Items with
 * children open their own arc. In the tabs variant, items are spheres; dragging one off the arc
 * dismisses it.
 *
 * Motion (web) lives in engine.web.ts; this component renders the structure at rest and tags the
 * animated parts with data-m. Test ids sit on still anchors at each item's resting place, so they
 * never move with the animation.
 *
 * Pointer-only by design: keyboard and screen-reader users get the same items as a standard list menu
 * (see ListMenu and CornerMenus).
 */
export function CornerMenu({ corner, variant, nodes, testID }: Props) {
  const { palette, fonts } = useTheme();
  const { width, height } = useWindowDimensions();
  const layout = layoutFor(width, height, variant);
  const origin = useMemo(() => originFor(corner, width, height, layout.inset), [corner, width, height, layout.inset]);
  const [motion] = useState(createMotion);

  const [mode, setMode] = useState<Mode>('closed');
  const [path, setPath] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; point: Point; off: boolean } | null>(null);

  const placed = useMemo(
    () => (mode === 'closed' ? [] : place(nodes, path, corner, origin, variant, width, height)),
    [mode, nodes, path, corner, origin, variant, width, height],
  );
  const previewAngles = useMemo(() => {
    const n = Math.min(5, nodes.length);
    return variant === 'tabs' ? firstRingAngles(n) : stackedAngles(n, layout.radii[0], LABEL_GAP);
  }, [nodes.length, variant, layout.radii]);

  const open = mode !== 'closed';
  const activePath = new Set(path);
  const deepest = Math.max(0, ...placed.map((p) => p.ring));

  // Label pills (menu variant): which show, and where. Open parents are shown in the breadcrumb
  // instead, so their labels don't cover child lines.
  const labels = new Map<string, LabelBox>();
  if (variant === 'menu') {
    for (const p of placed) {
      const onPath = activePath.has(p.item.id);
      const dimmed = p.ring < deepest && !onPath;
      const openParent = onPath && p.ring < deepest;
      if ((!dimmed && !openParent) || p.item.id === hover) labels.set(p.key, labelBox(corner, p.point, labelText(p.item), width, DOT / 2));
    }
  }

  // Gesture bookkeeping lives in a ref so responder callbacks always see current values.
  const g = useRef({ start: { x: 0, y: 0 }, startT: 0, moved: false, pressed: null as string | null, last: null as Point | null, dwell: null as { id: string; timer: ReturnType<typeof setTimeout> } | null, mode: 'closed' as Mode, path: [] as string[], hover: null as string | null, drag: null as typeof drag, placed: [] as Placed[], labels: new Map<string, LabelBox>() });
  useLayoutEffect(() => {
    g.current.mode = mode;
    g.current.path = path;
    g.current.hover = hover;
    g.current.drag = drag;
    g.current.placed = placed;
    g.current.labels = labels;
  });

  const close = useCallback(() => {
    if (g.current.dwell) clearTimeout(g.current.dwell.timer);
    g.current.dwell = null;
    setMode('closed');
    setPath([]);
    setHover(null);
    setDrag(null);
  }, []);

  const activate = useCallback(
    (node: RadialNode, ring: number) => {
      if (node.disabled) return;
      if (node.children?.length) {
        setPath((p) => [...p.slice(0, ring), node.id]);
        setMode('click');
        // The open parent moves to the breadcrumb; don't leave its label over the new arc.
        setHover(null);
        return;
      }
      motion.selected(node.id);
      close();
      node.onSelect?.();
    },
    [close, motion],
  );

  useEffect(() => {
    if (mode === 'closed') return;
    setPageSelectable(false);
    const off = onDocumentKey((e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
    return () => {
      off();
      setPageSelectable(true);
    };
  }, [mode, close]);

  const findPlaced = (id: string | null) => (id ? g.current.placed.find((p) => p.item.id === id) : undefined);

  /**
   * What a tap lands on: a dot right under the pointer, else a label pill (a tap on a label counts
   * as a tap on its dot), else the nearest item by angle (see hitTest).
   */
  const tapTarget = (pointer: Point) => {
    const s = g.current;
    const reach = variant === 'tabs' ? SPHERE / 2 + 8 : DOT / 2 + 12;
    let direct: Placed | undefined;
    let best = reach;
    for (const p of s.placed) {
      const d = Math.hypot(p.point.x - pointer.x, p.point.y - pointer.y);
      if (d <= best) {
        best = d;
        direct = p;
      }
    }
    if (direct) return direct;
    if (variant === 'menu') {
      for (const [key, box] of s.labels) {
        if (inBox(box, pointer)) return s.placed.find((p) => p.key === key);
      }
    }
    return hitTest(s.placed, pointer, toPolar(corner, origin, pointer), layout.radii, variant === 'tabs' ? SPHERE / 2 + 8 : 34) ?? undefined;
  };

  const pointerMove = (x: number, y: number) => {
    const s = g.current;
    s.last = { x, y };
    if (Math.hypot(x - s.start.x, y - s.start.y) > TAP_SLOP) s.moved = true;
    const pointer = { x, y };
    const polar = toPolar(corner, origin, pointer);

    if (variant === 'tabs') {
      // Grab: pressing on a sphere, or swiping over one and continuing past the arc.
      const grabbedId = s.drag?.id ?? s.pressed ?? s.hover;
      const grabbed = findPlaced(grabbedId);
      const hit = hitTest(s.placed, pointer, polar, layout.radii, SPHERE / 2 + 8);
      if (grabbed && (s.drag || (s.pressed && s.moved) || (!hit && polar.dist > layout.radii[layout.radii.length - 1] + 40))) {
        const off = Math.hypot(x - grabbed.point.x, y - grabbed.point.y) > DRAG_OFF && (!hit || hit.item.id === grabbed.item.id);
        if (hit && hit.item.id !== grabbed.item.id && !s.pressed) {
          setDrag(null);
          setHover(hit.item.id);
          return;
        }
        setDrag({ id: grabbed.item.id, point: pointer, off });
        return;
      }
      setHover(hit?.item.id ?? null);
      return;
    }

    const hit = hitTest(s.placed, pointer, polar, layout.radii);
    // Sticky parents: once an item's arc is open, its siblings take over only after the pointer
    // rests on one (a short dwell), so swiping across them toward the child arc doesn't collapse it.
    // Releasing on a sibling still selects it (see pointerUp).
    if (hit && hit.ring < s.path.length && hit.item.id !== s.path[hit.ring]) {
      const sibling = hit;
      if (s.dwell?.id !== sibling.item.id) {
        if (s.dwell) clearTimeout(s.dwell.timer);
        s.dwell = {
          id: sibling.item.id,
          timer: setTimeout(() => {
            const cur = g.current;
            cur.dwell = null;
            const still = cur.last && Math.hypot(sibling.point.x - cur.last.x, sibling.point.y - cur.last.y) <= 38;
            if (still && cur.mode !== 'closed') applyHit(sibling);
          }, DWELL_MS),
        };
      }
      return;
    }
    if (s.dwell) {
      clearTimeout(s.dwell.timer);
      s.dwell = null;
    }
    if (!hit) {
      setHover(null);
      return;
    }
    applyHit(hit);
  };

  const applyHit = (hit: PlacedItem<RadialNode>) => {
    const s = g.current;
    setHover(hit.item.id);
    if (hit.item.children?.length) {
      const next = [...s.path.slice(0, hit.ring), hit.item.id];
      if (next.join('/') !== s.path.join('/')) setPath(next);
    } else if (s.path.length > hit.ring) {
      setPath(s.path.slice(0, hit.ring));
    }
  };

  const pointerUp = (x: number, y: number, fromHint: boolean) => {
    const s = g.current;
    const tap = !s.moved && Date.now() - s.startT < TAP_MS;
    if (s.drag) {
      const grabbed = findPlaced(s.drag.id);
      const wasOff = s.drag.off;
      setDrag(null);
      s.pressed = null;
      if (wasOff && grabbed?.item.onDismiss) {
        motion.dismissed(grabbed.item.id);
        grabbed.item.onDismiss();
        setHover(null);
        setMode('click');
      }
      return;
    }
    const pointer = { x, y };
    const hit = hitTest(s.placed, pointer, toPolar(corner, origin, pointer), layout.radii, variant === 'tabs' ? SPHERE / 2 + 8 : 34);
    s.pressed = null;
    if (fromHint && !s.moved) {
      // Releasing the corner dot without swiping, after a quick tap or a long look, leaves the menu
      // open for tapping; tapping the dot again closes it.
      if (s.mode === 'swipe') setMode('click');
      else close();
      return;
    }
    if (tap) {
      const target = tapTarget(pointer);
      if (target) activate(target.item, target.ring);
      else close();
      return;
    }
    const target = hit ?? findPlaced(s.hover);
    if (target && (hit || s.hover === target.item.id)) activate(target.item, target.ring);
    else if (fromHint) close();
  };

  // Corner dot: press starts a swipe (marking-menu) gesture; the responder keeps receiving moves
  // anywhere on screen until release.
  const hintHandlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { pageX, pageY } = e.nativeEvent;
      g.current.start = { x: pageX, y: pageY };
      g.current.startT = Date.now();
      g.current.moved = false;
      g.current.pressed = null;
      if (g.current.mode === 'closed') {
        setMode('swipe');
        setPath([]);
        setHover(null);
      } else {
        g.current.mode = 'click';
      }
    },
    onResponderMove: (e: GestureResponderEvent) => {
      if (g.current.mode === 'closed') return;
      pointerMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
    },
    onResponderRelease: (e: GestureResponderEvent) => pointerUp(e.nativeEvent.pageX, e.nativeEvent.pageY, true),
    onResponderTerminate: () => close(),
  };

  // Open overlay (click mode): taps choose items; presses can still swipe or drag spheres.
  const overlayHandlers = {
    onStartShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { pageX, pageY } = e.nativeEvent;
      const s = g.current;
      s.start = { x: pageX, y: pageY };
      s.startT = Date.now();
      s.moved = false;
      const pointer = { x: pageX, y: pageY };
      const hit = tapTarget(pointer);
      s.pressed = variant === 'tabs' && hit?.item.onDismiss ? hit.item.id : null;
      if (hit) setHover(hit.item.id);
    },
    onResponderMove: (e: GestureResponderEvent) => pointerMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
    onResponderRelease: (e: GestureResponderEvent) => pointerUp(e.nativeEvent.pageX, e.nativeEvent.pageY, false),
    onResponderTerminate: () => close(),
  };

  const hintRef = useRef<View>(null);
  const overlayRef = useRef<View>(null);
  const ghostRef = useRef<View>(null);
  useEffect(() => guardCornerZone(hintRef.current), []);
  useEffect(() => (mode === 'closed' ? undefined : guardCornerZone(overlayRef.current)), [mode]);

  // Hand the current layout to the motion engine after every render (before paint).
  const motionItems: MotionItem[] = placed.map((p) => ({
    key: p.key,
    id: p.item.id,
    ring: p.ring,
    angle: p.angle,
    rest: p.point,
    parent: p.parentKey,
    order: p.order,
    size: variant === 'tabs' ? SPHERE : DOT,
    label: labels.get(p.key),
  }));
  const motionState: MotionState = {
    open,
    variant,
    corner,
    origin,
    items: motionItems,
    hover,
    path,
    drag: drag ? { id: drag.id, off: drag.off } : null,
    previewAngles,
  };
  useLayoutEffect(() => {
    motion.sync(motionState, { overlay: overlayRef.current, ghosts: ghostRef.current, hint: hintRef.current });
  });
  useEffect(() => () => motion.destroy(), [motion]);

  const side: 'left' | 'right' = corner === 'bottom-right' ? 'right' : 'left';
  const rings = variant === 'menu' ? layout.radii.slice(0, deepest + 1) : layout.radii.slice(0, placed.some((p) => p.ring === 1) ? 2 : 1);

  return (
    <>
      {open && (
        <View
          ref={overlayRef}
          testID={`${testID}-overlay`}
          style={[StyleSheet.absoluteFill, styles.overlay]}
          aria-hidden
          {...overlayHandlers}
        >
          <View dataSet={{ m: 'veil' }} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: palette.veil }]} />
          {rings.map((r, i) => (
            <View key={`ring-${i}`} dataSet={{ m: 'ring', k: String(i) }} pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View dataSet={{ m: 'spin' }} style={StyleSheet.absoluteFill}>
                <Svg width={width} height={height} pointerEvents="none">
                  <Circle cx={origin.x} cy={origin.y} r={r} fill="none" stroke={palette.gold} strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="0.5 7" strokeLinecap="round" />
                </Svg>
              </View>
            </View>
          ))}
          {placed.map((p) => {
            const strong = p.item.id === hover || activePath.has(p.item.id);
            const faded = p.ring < deepest && !activePath.has(p.item.id);
            const thick = strong ? 2.25 : 1.25;
            return (
              <View
                key={`line-${p.key}`}
                dataSet={{ m: 'line', k: p.key }}
                pointerEvents="none"
                style={[
                  styles.line,
                  { height: thick, top: -thick / 2, backgroundColor: withAlpha(palette.gold, faded ? 0.35 : 0.9) },
                  restingLine(p.from, p.point),
                ]}
              />
            );
          })}
          {TRAIL.map((size, i) => (
            <View
              key={`trail-${i}`}
              dataSet={{ m: 'trail', k: String(i), s: String(size) }}
              pointerEvents="none"
              style={[styles.trail, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.gold }]}
            />
          ))}
          <View dataSet={{ m: 'origin' }} pointerEvents="none" style={[styles.origin, { left: origin.x - 7, top: origin.y - 7, backgroundColor: palette.gold }]}>
            <View dataSet={{ m: 'ripple' }} style={[styles.ripple, { borderColor: palette.gold }]} />
          </View>
          {placed.map((p) => {
            const isHover = p.item.id === hover;
            const onPath = activePath.has(p.item.id);
            const dimmed = p.ring < deepest && !onPath;
            if (variant === 'tabs') {
              const dragging = drag?.id === p.item.id;
              const off = dragging && drag.off;
              // Native has no engine to move a dragged sphere, so it's positioned at the pointer.
              const at = dragging && Platform.OS !== 'web' ? drag.point : p.point;
              return (
                <Fragment key={p.key}>
                  <View testID={`${testID}-item-${p.item.id}`} pointerEvents="none" style={[styles.sphereAnchor, { left: p.point.x - SPHERE / 2, top: p.point.y - SPHERE / 2 }]} />
                  <View dataSet={{ m: 'dot', k: p.key }} pointerEvents="none" style={[styles.sphereWrap, { left: at.x - SPHERE / 2, top: at.y - SPHERE / 2 }]}>
                    <View
                      dataSet={{ m: 'glow' }}
                      style={[styles.sphereGlow, { backgroundColor: withAlpha(palette.gold, 0.16), boxShadow: `0 0 22px 4px ${withAlpha(palette.gold, 0.45)}` }]}
                    />
                    <View
                      style={[
                        styles.sphere,
                        {
                          backgroundColor: off ? withAlpha(palette.peach, 0.55) : isHover || dragging ? palette.highlight : palette.surface,
                          borderColor: palette.gold,
                          borderWidth: p.item.active ? 3 : 1.5,
                        },
                      ]}
                    >
                      <Icon name={off ? 'close' : (p.item.icon ?? 'page')} size={16} color={palette.text} />
                      {p.item.short ? (
                        <Text numberOfLines={1} style={[styles.sphereLabel, { color: palette.text, fontFamily: fonts.ui }]}>
                          {p.item.short}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Fragment>
              );
            }
            const box = labels.get(p.key);
            const pill: ViewStyle | null = box
              ? box.side < 0
                ? { right: width - (box.x + box.w), top: box.y }
                : { left: box.x, top: box.y }
              : null;
            return (
              <Fragment key={p.key}>
                <View testID={`${testID}-item-${p.item.id}`} pointerEvents="none" style={[styles.anchor, { left: p.point.x - DOT / 2, top: p.point.y - DOT / 2 }]} />
                <View dataSet={{ m: 'dot', k: p.key }} pointerEvents="none" style={[styles.dotWrap, { left: p.point.x - DOT / 2, top: p.point.y - DOT / 2 }]}>
                  <View dataSet={{ m: 'glow' }} style={[styles.glow, { backgroundColor: withAlpha(palette.gold, 0.2), boxShadow: `0 0 16px 3px ${withAlpha(palette.gold, 0.5)}` }]} />
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: isHover || onPath || p.item.active ? palette.gold : palette.surface,
                        borderColor: palette.gold,
                        opacity: dimmed ? 0.45 : p.item.disabled ? 0.4 : 1,
                      },
                    ]}
                  />
                  <View dataSet={{ m: 'fill' }} style={[styles.fill, { backgroundColor: palette.gold }]} />
                  <View dataSet={{ m: 'icon' }} style={styles.icon}>
                    <Icon name={p.item.icon ?? 'dot'} size={11} color={palette.bg} strokeWidth={2.5} />
                  </View>
                </View>
                {box && pill && (
                  <View dataSet={{ m: 'label', k: p.key, d: box.side < 0 ? 'l' : 'r', g: palette.gold }} pointerEvents="none" style={[styles.pillWrap, pill]}>
                    <View
                      style={[
                        styles.pill,
                        {
                          backgroundColor: isHover ? palette.highlight : palette.surface,
                          borderColor: isHover || onPath ? palette.gold : palette.rule,
                        },
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.pillText, { color: palette.text, fontFamily: fonts.ui }]}>
                        {labelText(p.item)}
                      </Text>
                    </View>
                  </View>
                )}
              </Fragment>
            );
          })}
          {variant === 'menu' && path.length > 0 && (
            <View
              key={`crumb-${path.join('/')}`}
              dataSet={{ m: 'crumb', k: 'path' }}
              pointerEvents="none"
              style={[styles.breadcrumb, side === 'right' ? { right: width - origin.x - 12 } : { left: origin.x - 12 }, { bottom: height - origin.y + 20 }]}
            >
              <View style={[styles.pill, { backgroundColor: palette.surface, borderColor: palette.gold }]}>
                <Text numberOfLines={1} style={[styles.pillText, { color: palette.text, fontFamily: fonts.ui, fontWeight: '600' }]}>
                  {path.map((id) => placed.find((p) => p.item.id === id)?.item.label).filter(Boolean).join(' › ')}
                </Text>
              </View>
            </View>
          )}
          {variant === 'tabs' && drag?.off && (
            <View
              dataSet={{ m: 'crumb', k: 'note' }}
              pointerEvents="none"
              style={[styles.hint, { left: drag.point.x - 80, top: drag.point.y - SPHERE / 2 - 40, width: 160 }]}
            >
              <View style={[styles.pill, { backgroundColor: palette.surface, borderColor: palette.gold }]}>
                <Text style={[styles.pillText, { color: palette.text, fontFamily: fonts.ui }]}>{t('tabs.releaseToClose')}</Text>
              </View>
            </View>
          )}
        </View>
      )}
      {/* Removed pieces animate out here (see engine.web.ts). */}
      <View ref={ghostRef} testID={`${testID}-ghosts`} pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, styles.ghosts]} />
      <View
        ref={hintRef}
        testID={`${testID}-hint`}
        aria-hidden
        style={[
          styles.hintZone,
          { width: HINT, height: HINT, left: origin.x - HINT / 2, top: origin.y - HINT / 2 },
          Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : null,
        ]}
        {...hintHandlers}
      >
        <View dataSet={{ m: 'hint-ping' }} style={[styles.ping, { borderColor: palette.gold, opacity: 0 }]} />
        <View dataSet={{ m: 'hint-halo' }} style={[styles.halo, { borderColor: withAlpha(palette.gold, 0.7), backgroundColor: withAlpha(palette.gold, 0.08) }]} />
        {previewAngles.map((_, i) => (
          <View key={`ghost-${i}`} dataSet={{ m: 'hint-ghost', k: String(i) }} style={[styles.preview, { backgroundColor: palette.gold }]} />
        ))}
        <View dataSet={{ m: 'hint-core' }} style={styles.core}>
          <View
            testID={`${testID}-hint-dot`}
            dataSet={{ m: 'hint-breath' }}
            style={[styles.hintDot, { backgroundColor: palette.gold, opacity: open ? 0 : 0.85 }]}
          />
        </View>
      </View>
    </>
  );
}

const centered = (size: number): ViewStyle => ({ position: 'absolute', width: size, height: size, borderRadius: size / 2, left: (HINT - size) / 2, top: (HINT - size) / 2 });

const styles = StyleSheet.create({
  overlay: { zIndex: 50 },
  ghosts: { zIndex: 55 },
  hintZone: { position: 'absolute', zIndex: 60 },
  core: { ...centered(10), alignItems: 'center', justifyContent: 'center' },
  hintDot: { width: 10, height: 10, borderRadius: 5 },
  halo: { ...centered(30), borderWidth: 1.5, opacity: 0 },
  ping: { ...centered(12), borderWidth: 1.5 },
  preview: { ...centered(5), opacity: 0 },
  origin: { position: 'absolute', width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  ripple: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, opacity: 0 },
  line: { position: 'absolute', left: 0, width: LINE_BASE },
  trail: { position: 'absolute', left: 0, top: 0, opacity: 0 },
  anchor: { position: 'absolute', width: DOT, height: DOT },
  dotWrap: { position: 'absolute', width: DOT, height: DOT },
  glow: { position: 'absolute', width: DOT * 2.2, height: DOT * 2.2, borderRadius: DOT * 1.1, left: -DOT * 0.6, top: -DOT * 0.6, opacity: 0 },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2 },
  fill: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, opacity: 0 },
  icon: { position: 'absolute', width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center', opacity: 0 },
  pillWrap: { position: 'absolute' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 13, borderWidth: 1 },
  pillText: { fontSize: 14, lineHeight: 18, fontWeight: '500' },
  sphereAnchor: { position: 'absolute', width: SPHERE, height: SPHERE },
  sphereWrap: { position: 'absolute', width: SPHERE, height: SPHERE },
  sphereGlow: { position: 'absolute', width: SPHERE * 1.5, height: SPHERE * 1.5, borderRadius: SPHERE * 0.75, left: -SPHERE * 0.25, top: -SPHERE * 0.25, opacity: 0 },
  sphere: {
    position: 'absolute',
    width: SPHERE,
    height: SPHERE,
    borderRadius: SPHERE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  sphereLabel: { fontSize: 11, fontWeight: '600', maxWidth: SPHERE - 6 },
  hint: { position: 'absolute', alignItems: 'center' },
  breadcrumb: { position: 'absolute' },
});
