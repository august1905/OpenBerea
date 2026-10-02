import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { t } from '@/i18n';
import { guardCornerZone, onDocumentKey, setPageSelectable } from '@/lib/platform/dom';
import { useTheme } from '@/theme';

import { Icon } from '../Icon';
import {
  type Corner,
  estimateLabelWidth,
  firstRingAngles,
  hitTest,
  labelSide,
  layoutFor,
  originFor,
  overflowRingAngles,
  type PlacedItem,
  type Point,
  stackedAngles,
  toPolar,
  toScreen,
} from './geometry';
import type { RadialNode } from './types';

type Mode = 'closed' | 'swipe' | 'click';

interface Placed extends PlacedItem<RadialNode> {
  /** Where the connecting line starts (the corner origin or the parent dot). */
  from: Point;
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

function place(nodes: RadialNode[], path: string[], corner: Corner, origin: Point, variant: 'menu' | 'tabs', width: number, height: number): Placed[] {
  const layout = layoutFor(width, height, variant);
  const out: Placed[] = [];
  if (variant === 'tabs') {
    const first = nodes.slice(0, 5);
    const rest = nodes.slice(5);
    firstRingAngles(first.length).forEach((angle, i) =>
      out.push({ item: first[i], ring: 0, angle, point: toScreen(corner, origin, { angle, dist: layout.radii[0] }), from: origin }),
    );
    overflowRingAngles(rest.length, layout.radii[1], layout.spacing).forEach((angle, i) =>
      out.push({ item: rest[i], ring: 1, angle, point: toScreen(corner, origin, { angle, dist: layout.radii[1] }), from: origin }),
    );
    return out;
  }
  const top = nodes.slice(0, 5);
  stackedAngles(top.length, layout.radii[0], LABEL_GAP).forEach((angle, i) =>
    out.push({ item: top[i], ring: 0, angle, point: toScreen(corner, origin, { angle, dist: layout.radii[0] }), from: origin }),
  );
  for (let depth = 0; depth < path.length && depth + 1 < layout.radii.length; depth++) {
    const parent = out.find((p) => p.ring === depth && p.item.id === path[depth]);
    const kids = parent?.item.children?.slice(0, 5);
    if (!parent || !kids?.length) break;
    const r = layout.radii[depth + 1];
    stackedAngles(kids.length, r, LABEL_GAP, parent.angle).forEach((angle, i) =>
      out.push({ item: kids[i], ring: depth + 1, angle, point: toScreen(corner, origin, { angle, dist: r }), from: parent.point }),
    );
  }
  return out;
}

/**
 * A quarter-radial marking menu anchored in a screen corner. Press and hold the corner dot and swipe
 * toward an item, or click/tap the dot to open it and tap items. Items with children open their own
 * arc. In the tabs variant, items are spheres; dragging one off the arc dismisses it.
 *
 * Pointer-only by design: keyboard and screen-reader users get the same items as a standard list menu
 * (see ListMenu and CornerMenus).
 */
export function CornerMenu({ corner, variant, nodes, testID }: Props) {
  const { palette, fonts } = useTheme();
  const { width, height } = useWindowDimensions();
  const layout = layoutFor(width, height, variant);
  const origin = useMemo(() => originFor(corner, width, height, layout.inset), [corner, width, height, layout.inset]);

  const [mode, setMode] = useState<Mode>('closed');
  const [path, setPath] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; point: Point; off: boolean } | null>(null);

  const placed = useMemo(
    () => (mode === 'closed' ? [] : place(nodes, path, corner, origin, variant, width, height)),
    [mode, nodes, path, corner, origin, variant, width, height],
  );

  // Gesture bookkeeping lives in a ref so responder callbacks always see current values.
  const g = useRef({ start: { x: 0, y: 0 }, startT: 0, moved: false, pressed: null as string | null, last: null as Point | null, dwell: null as { id: string; timer: ReturnType<typeof setTimeout> } | null, mode: 'closed' as Mode, path: [] as string[], hover: null as string | null, drag: null as typeof drag, placed: [] as Placed[] });
  useLayoutEffect(() => {
    g.current.mode = mode;
    g.current.path = path;
    g.current.hover = hover;
    g.current.drag = drag;
    g.current.placed = placed;
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
        return;
      }
      close();
      node.onSelect?.();
    },
    [close],
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
        grabbed.item.onDismiss();
        setHover(null);
        setMode('click');
      }
      return;
    }
    const pointer = { x, y };
    const hit = hitTest(s.placed, pointer, toPolar(corner, origin, pointer), layout.radii, variant === 'tabs' ? SPHERE / 2 + 8 : 34);
    s.pressed = null;
    if (tap) {
      if (fromHint) {
        // A tap on the corner dot toggles the menu open for clicking.
        if (s.mode === 'swipe') setMode('click');
        else close();
        return;
      }
      if (hit) activate(hit.item, hit.ring);
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
      const hit = hitTest(s.placed, pointer, toPolar(corner, origin, pointer), layout.radii, variant === 'tabs' ? SPHERE / 2 + 8 : 34);
      s.pressed = variant === 'tabs' && hit?.item.onDismiss ? hit.item.id : null;
      if (hit) setHover(hit.item.id);
    },
    onResponderMove: (e: GestureResponderEvent) => pointerMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
    onResponderRelease: (e: GestureResponderEvent) => pointerUp(e.nativeEvent.pageX, e.nativeEvent.pageY, false),
    onResponderTerminate: () => close(),
  };

  const hintRef = useRef<View>(null);
  const overlayRef = useRef<View>(null);
  useEffect(() => guardCornerZone(hintRef.current), []);
  useEffect(() => (mode === 'closed' ? undefined : guardCornerZone(overlayRef.current)), [mode]);

  const open = mode !== 'closed';
  const activePath = new Set(path);
  const deepest = Math.max(0, ...placed.map((p) => p.ring));
  const side: 'left' | 'right' = corner === 'bottom-right' ? 'right' : 'left';
  const hintSize = 56;

  return (
    <>
      {open && (
        <View
          ref={overlayRef}
          testID={`${testID}-overlay`}
          style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: palette.veil }]}
          aria-hidden
          {...overlayHandlers}
        >
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            {placed.map((p) => (
              <Line
                key={`l-${p.ring}-${p.item.id}`}
                x1={p.from.x}
                y1={p.from.y}
                x2={p.point.x}
                y2={p.point.y}
                stroke={palette.gold}
                strokeWidth={p.item.id === hover || activePath.has(p.item.id) ? 2.25 : 1.25}
                strokeOpacity={p.ring < deepest && !activePath.has(p.item.id) ? 0.35 : 0.9}
              />
            ))}
            <Circle cx={origin.x} cy={origin.y} r={7} fill={palette.gold} />
          </Svg>
          {placed.map((p) => {
            const isHover = p.item.id === hover;
            const onPath = activePath.has(p.item.id);
            const dimmed = p.ring < deepest && !onPath;
            const dragging = drag?.id === p.item.id;
            const at = dragging ? drag.point : p.point;
            if (variant === 'tabs') {
              return (
                <View
                  key={p.item.id}
                  testID={`${testID}-item-${p.item.id}`}
                  pointerEvents="none"
                  style={[
                    styles.sphere,
                    {
                      left: at.x - SPHERE / 2,
                      top: at.y - SPHERE / 2,
                      backgroundColor: isHover || dragging ? palette.highlight : palette.surface,
                      borderColor: palette.gold,
                      borderWidth: p.item.active ? 3 : 1.5,
                      opacity: dragging && drag.off ? 0.8 : 1,
                    },
                  ]}
                >
                  <Icon name={dragging && drag.off ? 'close' : (p.item.icon ?? 'page')} size={16} color={palette.text} />
                  {p.item.short ? (
                    <Text numberOfLines={1} style={[styles.sphereLabel, { color: palette.text, fontFamily: fonts.ui }]}>
                      {p.item.short}
                    </Text>
                  ) : null}
                </View>
              );
            }
            const labelText = `${p.item.label}${p.item.active ? ' ✓' : ''}${p.item.children?.length ? ' ›' : ''}`;
            const inward = labelSide(corner, p.point.x, estimateLabelWidth(labelText), width, DOT / 2) === 'inward';
            // Inward = toward the middle of the screen; anchor the pill's near edge next to the dot.
            const anchorRight = side === 'right' ? inward : !inward;
            const pill: ViewStyle = anchorRight
              ? { right: width - p.point.x + DOT / 2 + 6, top: p.point.y - 14 }
              : { left: p.point.x + DOT / 2 + 6, top: p.point.y - 14 };
            // Open parents are shown in the breadcrumb instead, so their labels don't cover child lines.
            const openParent = onPath && p.ring < deepest;
            const showLabel = (!dimmed && !openParent) || isHover;
            return (
              <View key={`${p.ring}-${p.item.id}`} pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View
                  testID={`${testID}-item-${p.item.id}`}
                  style={[
                    styles.dot,
                    {
                      left: p.point.x - DOT / 2,
                      top: p.point.y - DOT / 2,
                      backgroundColor: isHover || onPath || p.item.active ? palette.gold : palette.surface,
                      borderColor: palette.gold,
                      opacity: dimmed ? 0.45 : p.item.disabled ? 0.4 : 1,
                    },
                  ]}
                />
                {showLabel && (
                  <View style={[styles.pillWrap, pill]}>
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
                        {labelText}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
          {variant === 'menu' && path.length > 0 && (
            <View
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
            <View pointerEvents="none" style={[styles.hint, { left: drag.point.x - 80, top: drag.point.y - SPHERE / 2 - 34, width: 160 }]}>
              <View style={[styles.pill, { backgroundColor: palette.surface, borderColor: palette.gold }]}>
                <Text style={[styles.pillText, { color: palette.text, fontFamily: fonts.ui }]}>{t('tabs.releaseToClose')}</Text>
              </View>
            </View>
          )}
        </View>
      )}
      <View
        ref={hintRef}
        testID={`${testID}-hint`}
        aria-hidden
        style={[
          styles.hintZone,
          { width: hintSize, height: hintSize, left: origin.x - hintSize / 2, top: origin.y - hintSize / 2 },
          Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : null,
        ]}
        {...hintHandlers}
      >
        <View style={[styles.hintDot, { backgroundColor: palette.gold, opacity: open ? 0 : 0.85 }]} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 50 },
  hintZone: { position: 'absolute', zIndex: 60, alignItems: 'center', justifyContent: 'center' },
  hintDot: { width: 10, height: 10, borderRadius: 5 },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2 },
  pillWrap: { position: 'absolute' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 13, borderWidth: 1 },
  pillText: { fontSize: 14, lineHeight: 18, fontWeight: '500' },
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
