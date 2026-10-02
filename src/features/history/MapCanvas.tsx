import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { t } from '@/i18n';
import type { BaseMap } from '@/lib/data/types';
import { setPageSelectable } from '@/lib/platform/dom';
import { type Palette, useTheme } from '@/theme';

import { attachMapInput, setGrabbing } from './mapInput';
import { RoundButton } from './parts';
import {
  atLeast,
  type Box,
  centerOn,
  clampView,
  dotsPath,
  fitBox,
  hitTest,
  labelScale,
  type MapPoint,
  type MapView,
  pathRings,
  type PlacedLabel,
  placeLabels,
  ringAt,
  textWidth,
  toMap,
  type ViewLimits,
  zoomAt,
} from './projection';

// The interactive map: the Natural Earth base map drawn with react-native-svg in theme colors, with
// gold dots for places. Pan and zoom only change one group's transform; the base paths and markers
// are memoized and re-render only when the label zoom step, the selection, or the labels change.

const MAX_SCALE = 60;
/** Scale (pixels per map unit) at which names appear for every place, not just highlighted ones. */
const LABEL_ZOOM = 2.5;
const FOCUS_SCALE = 14;
const BUTTON_ZOOM = 1.6;
const TAP_SLOP = 6;
const HIT_RADIUS = 22;
const FONT = 12;
/** An inland sea is named once its lake is this many pixels long on screen. */
const LAKE_LABEL_PX = 40;

/** Marker diameter in pixels: smaller when zoomed out, where places crowd together. */
const dotSize = (ls: number) => (ls < 2 ? 5 : ls < 6 ? 7 : 8);

export interface FocusRequest {
  id: string;
  /** Changes on every request, so asking twice for the same place still recenters. */
  seq: number;
}

interface Props {
  base: BaseMap;
  points: MapPoint[];
  selected: string | null;
  /** Places that are always labelled when there is room (a chapter's places). */
  labelled?: Set<string>;
  /** Box to fit at first and on reset; null fits the whole map. */
  initial: Box | null;
  /** Place to center on at first (the ?place= link). */
  initialFocus?: string | null;
  focus?: FocusRequest | null;
  onSelect: (id: string) => void;
  height: number;
  label: string;
}

interface Colors {
  water: string;
  land: string;
  landOpacity: number;
  coast: string;
  river: string;
  riverOpacity: number;
  gold: string;
  halo: string;
  outline: string;
  text: string;
  muted: string;
}

function colorsFor(p: Palette): Colors {
  return {
    water: p.bg,
    land: p.rule,
    landOpacity: p.highContrast ? 0.18 : p.scheme === 'dark' ? 0.75 : 0.6,
    coast: p.highContrast ? p.text : p.rule,
    river: p.muted,
    riverOpacity: p.highContrast ? 0.6 : 0.35,
    gold: p.gold,
    halo: p.peach,
    outline: p.bg,
    text: p.text,
    muted: p.muted,
  };
}

const BaseLayers = memo(function BaseLayers({ base, c }: { base: BaseMap; c: Colors }) {
  return (
    <>
      <Path d={base.land} fill={c.land} fillOpacity={c.landOpacity} stroke={c.coast} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      <Path d={base.lakes} fill={c.water} stroke={c.coast} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      <Path
        d={base.rivers}
        fill="none"
        stroke={c.river}
        strokeOpacity={c.riverOpacity}
        strokeWidth={0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
});

/** Text with a halo in the background color, so names stay readable over coasts and rivers. */
function MapLabel({ l, size, color, halo, bold, italic, family, testID }: {
  l: PlacedLabel;
  size: number;
  color: string;
  halo: string;
  bold?: boolean;
  italic?: boolean;
  family: string;
  testID?: string;
}) {
  const common = {
    x: l.x,
    y: l.y,
    dy: size * 0.35,
    fontSize: size,
    fontFamily: family,
    fontWeight: bold ? ('600' as const) : ('400' as const),
    fontStyle: italic ? ('italic' as const) : ('normal' as const),
    textAnchor: l.anchor,
  };
  return (
    <>
      <SvgText {...common} fill="none" stroke={halo} strokeWidth={size * 0.32} strokeLinejoin="round">
        {l.text}
      </SvgText>
      <SvgText {...common} fill={color} testID={testID}>
        {l.text}
      </SvgText>
    </>
  );
}

const SeaLabels = memo(function SeaLabels({ labels, ls, c, family }: { labels: PlacedLabel[]; ls: number; c: Colors; family: string }) {
  return (
    <>
      {labels.map((l) => (
        <MapLabel key={l.id} l={l} size={11 / ls} color={c.muted} halo={c.water} italic family={family} />
      ))}
    </>
  );
});

const Markers = memo(function Markers({
  points,
  selected,
  labels,
  ls,
  dot,
  c,
  family,
}: {
  points: MapPoint[];
  selected: MapPoint | null;
  labels: PlacedLabel[];
  ls: number;
  dot: number;
  c: Colors;
  family: string;
}) {
  const d = useMemo(() => dotsPath(points), [points]);
  const sel = selected ? dotsPath([selected]) : '';
  const round = { strokeLinecap: 'round' as const, vectorEffect: 'non-scaling-stroke' as const, fill: 'none' };
  return (
    <>
      <Path d={d} stroke={c.outline} strokeWidth={dot + 3} {...round} />
      <Path d={d} stroke={c.gold} strokeWidth={dot} {...round} />
      {selected ? (
        <>
          <Path d={sel} stroke={c.halo} strokeOpacity={0.55} strokeWidth={30} {...round} />
          <Path d={sel} stroke={c.outline} strokeWidth={dot + 7} {...round} />
          <Path d={sel} stroke={c.gold} strokeWidth={dot + 4} {...round} />
        </>
      ) : null}
      {labels.map((l) => (
        <MapLabel
          key={l.id}
          l={l}
          size={FONT / ls}
          color={c.text}
          halo={c.water}
          bold={l.id === selected?.id}
          family={family}
          testID={`map-label-${l.id}`}
        />
      ))}
    </>
  );
});

export function MapCanvas({ base, points, selected, labelled, initial, initialFocus, focus, onSelect, height, label }: Props) {
  const { palette, fonts } = useTheme();
  const c = useMemo(() => colorsFor(palette), [palette]);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setViewState] = useState<MapView | null>(null);
  // The view that labels were laid out for; updated when a gesture ends, not on every frame.
  const [labelView, setLabelView] = useState<MapView | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const surfaceRef = useRef<View>(null);
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);

  const limits = useMemo<ViewLimits | null>(() => {
    if (!size) return null;
    const whole = fitBox([0, 0, base.width, base.height], size.w, size.h, 0);
    return { minS: whole.s * 0.9, maxS: MAX_SCALE, width: base.width, height: base.height };
  }, [size, base]);

  const home = useMemo<MapView | null>(() => {
    if (!size || !limits) return null;
    if (initial) return clampView(fitBox(atLeast(initial, 30), size.w, size.h, 36), size.w, size.h, limits);
    // The whole map fills the viewport (cropping a little at the edges): no empty strips, and on a
    // phone the middle of the map, the Holy Land, is in view.
    const s = Math.max(size.w / base.width, size.h / base.height);
    return clampView(centerOn(base.width / 2, base.height / 2, s, size.w, size.h), size.w, size.h, limits);
  }, [size, limits, initial, base]);

  const setView = useCallback((v: MapView, relabel = true) => {
    viewRef.current = v;
    setViewState(v);
    if (relabel) setLabelView(v);
  }, []);

  // First layout: fit the initial box, or center on the linked place.
  const started = useRef(false);
  useEffect(() => {
    if (!size || !limits || !home || started.current) return;
    started.current = true;
    const p = initialFocus ? byId.get(initialFocus) : undefined;
    setView(p ? clampView(centerOn(p.x, p.y, Math.max(home.s, FOCUS_SCALE), size.w, size.h), size.w, size.h, limits) : home);
  }, [size, limits, home, initialFocus, byId, setView]);

  // Requests from the place list: center on the place, zooming in if needed.
  useEffect(() => {
    if (!focus || !size || !limits || !viewRef.current) return;
    const p = byId.get(focus.id);
    if (!p) return;
    const s = Math.max(viewRef.current.s, Math.min(FOCUS_SCALE, limits.maxS));
    setView(clampView(centerOn(p.x, p.y, s, size.w, size.h), size.w, size.h, limits));
  }, [focus, size, limits, byId, setView]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize((prev) => (prev && Math.abs(prev.w - width) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w: width, h }));
  };

  // Keep the same center when the viewport changes size (rotation, window resize).
  const lastSize = useRef<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const prev = lastSize.current;
    lastSize.current = size;
    const v = viewRef.current;
    if (!prev || !size || !v || !limits) return;
    const [cx, cy] = toMap(v, prev.w / 2, prev.h / 2);
    setView(clampView(centerOn(cx, cy, v.s, size.w, size.h), size.w, size.h, limits));
  }, [size, limits, setView]);

  const zoomBy = useCallback(
    (factor: number, x?: number, y?: number) => {
      const v = viewRef.current;
      if (!v || !size || !limits) return;
      setView(zoomAt(v, factor, x ?? size.w / 2, y ?? size.h / 2, size.w, size.h, limits));
    },
    [size, limits, setView],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const v = viewRef.current;
      if (!v || !size || !limits) return;
      setView(clampView({ ...v, tx: v.tx + dx, ty: v.ty + dy }, size.w, size.h, limits));
    },
    [size, limits, setView],
  );

  const reset = useCallback(() => {
    if (home) setView(home);
  }, [home, setView]);

  // Web: mouse wheel zoom, keyboard pan/zoom, and no browser panning over the map.
  useEffect(
    () =>
      attachMapInput(surfaceRef.current, {
        zoom: (f, x, y) => zoomBy(f, x, y),
        key: (key) => {
          const step = 80;
          if (key === 'ArrowLeft') panBy(step, 0);
          else if (key === 'ArrowRight') panBy(-step, 0);
          else if (key === 'ArrowUp') panBy(0, step);
          else if (key === 'ArrowDown') panBy(0, -step);
          else if (key === '+' || key === '=') zoomBy(BUTTON_ZOOM);
          else if (key === '-' || key === '_') zoomBy(1 / BUTTON_ZOOM);
          else if (key === '0') reset();
          else return false;
          return true;
        },
      }),
    [zoomBy, panBy, reset],
  );

  // Drag to pan, pinch to zoom, tap to choose a place.
  const gesture = useRef<{
    x: number;
    y: number;
    start: MapView;
    moved: boolean;
    pinch: { dist: number; mx: number; my: number; start: MapView } | null;
  } | null>(null);

  const touchesOf = (e: GestureResponderEvent) => e.nativeEvent.touches ?? [];
  const lastTap = useRef<string | null>(null);

  const responder = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      if (!viewRef.current) return;
      gesture.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, start: viewRef.current, moved: false, pinch: null };
      setPageSelectable(false);
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const g = gesture.current;
      if (!g || !size || !limits) return;
      const touches = touchesOf(e);
      if (touches.length >= 2) {
        const [a, b] = touches;
        const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
        const mx = (a.locationX + b.locationX) / 2;
        const my = (a.locationY + b.locationY) / 2;
        if (!g.pinch) {
          g.pinch = { dist, mx, my, start: viewRef.current! };
          g.moved = true;
          return;
        }
        const p = g.pinch;
        const zoomed = zoomAt(p.start, dist / Math.max(1, p.dist), p.mx, p.my, size.w, size.h, limits);
        setView(clampView({ ...zoomed, tx: zoomed.tx + (mx - p.mx), ty: zoomed.ty + (my - p.my) }, size.w, size.h, limits), false);
        return;
      }
      if (g.pinch) {
        // A finger lifted: continue as a pan from here.
        g.pinch = null;
        g.x = e.nativeEvent.pageX;
        g.y = e.nativeEvent.pageY;
        g.start = viewRef.current!;
        return;
      }
      const dx = e.nativeEvent.pageX - g.x;
      const dy = e.nativeEvent.pageY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      if (!g.moved) setGrabbing(surfaceRef.current, true);
      g.moved = true;
      setView(clampView({ ...g.start, tx: g.start.tx + dx, ty: g.start.ty + dy }, size.w, size.h, limits), false);
    },
    onResponderRelease: (e: GestureResponderEvent) => {
      const g = gesture.current;
      gesture.current = null;
      setPageSelectable(true);
      setGrabbing(surfaceRef.current, false);
      const v = viewRef.current;
      if (!g || !v) return;
      if (g.moved) {
        setLabelView(v);
        return;
      }
      // Tapping the same spot again moves through places stacked there (Jerusalem, Zion, Judea).
      const hit = hitTest(points, v, e.nativeEvent.locationX, e.nativeEvent.locationY, HIT_RADIUS, lastTap.current);
      if (hit) {
        lastTap.current = hit.id;
        onSelect(hit.id);
      }
    },
    onResponderTerminate: () => {
      gesture.current = null;
      setPageSelectable(true);
      setGrabbing(surfaceRef.current, false);
      if (viewRef.current) setLabelView(viewRef.current);
    },
  };

  // Size (largest side, map units) of the lake under each sea label, for seas that are lakes.
  const lakeSizes = useMemo(() => {
    const rings = pathRings(base.lakes);
    const out = new Map<string, number>();
    for (const sea of base.seas) {
      const b = ringAt(rings, sea.x, sea.y);
      if (b) out.set(sea.name, Math.max(b[2] - b[0], b[3] - b[1]));
    }
    return out;
  }, [base]);

  // Labels: laid out for the label view (quantized zoom), over the viewport and a margin around it.
  const ls = labelView ? labelScale(labelView.s) : 1;
  const selectedPoint = selected ? (byId.get(selected) ?? null) : null;
  const seaLabels = useMemo<PlacedLabel[]>(() => {
    if (!labelView) return [];
    return base.seas
      .filter((sea) => {
        const w = textWidth(sea.name, 11) / ls / 2;
        const h = 9 / ls;
        // Inland seas (lakes on the base map: Galilee, the Dead Sea) are named once the lake is big
        // enough on screen; open seas are always named.
        const lake = lakeSizes.get(sea.name);
        if (lake && lake * labelView.s < LAKE_LABEL_PX) return false;
        return !points.some((p) => Math.abs(p.x - sea.x) < w + 4 / ls && Math.abs(p.y - sea.y) < h + 4 / ls);
      })
      .map((sea) => ({ id: sea.name, text: sea.name, x: sea.x, y: sea.y, anchor: 'middle' as const }));
  }, [base, points, labelView, ls, lakeSizes]);

  const labels = useMemo<PlacedLabel[]>(() => {
    if (!labelView || !size) return [];
    const [x0, y0] = toMap(labelView, -size.w * 0.5, -size.h * 0.5);
    const [x1, y1] = toMap(labelView, size.w * 1.5, size.h * 1.5);
    const all = labelView.s >= LABEL_ZOOM;
    const candidates = points
      .filter((p) => all || p.id === selected || labelled?.has(p.id))
      .map((p) => ({
        id: p.id,
        text: p.name,
        x: p.x,
        y: p.y,
        priority: p.id === selected ? 1e9 : labelled?.has(p.id) ? 1e6 + p.n : p.n,
        force: p.id === selected,
      }));
    const avoid = seaLabels.map((l): Box => {
      const w = textWidth(l.text, 11) / ls;
      return [l.x - w / 2, l.y - 8 / ls, l.x + w / 2, l.y + 8 / ls];
    });
    // Names never cover another place's dot.
    const r = (dotSize(ls) / 2 + 1.5) / ls;
    for (const p of points) {
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) avoid.push([p.x - r, p.y - r, p.x + r, p.y + r]);
    }
    return placeLabels(candidates, ls, { fontSize: FONT, gap: 8, region: [x0, y0, x1, y1], avoid, max: 160 });
  }, [labelView, size, points, selected, labelled, ls, seaLabels]);

  const dot = dotSize(ls);
  const transform = view ? `translate(${view.tx.toFixed(2)} ${view.ty.toFixed(2)}) scale(${view.s.toFixed(5)})` : undefined;

  return (
    <View style={[styles.frame, { height, borderColor: palette.rule, backgroundColor: c.water }]} onLayout={onLayout}>
      {size && view ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} aria-hidden pointerEvents="none">
          <Rect x={0} y={0} width={size.w} height={size.h} fill={c.water} />
          <G id="map-view" transform={transform}>
            <BaseLayers base={base} c={c} />
            <SeaLabels labels={seaLabels} ls={ls} c={c} family={fonts.ui} />
            <Markers points={points} selected={selectedPoint} labels={labels} ls={ls} dot={dot} c={c} family={fonts.ui} />
          </G>
        </Svg>
      ) : null}
      <View
        ref={surfaceRef}
        testID="map-surface"
        role="group"
        aria-label={label}
        {...({ focusable: true } as object)}
        style={StyleSheet.absoluteFill}
        {...responder}
      />
      <View style={styles.controls} role="group" aria-label={t('history.map.controls')}>
        <RoundButton testID="map-zoom-in" glyph="plus" label={t('history.map.zoomIn')} onPress={() => zoomBy(BUTTON_ZOOM)} />
        <RoundButton testID="map-zoom-out" glyph="minus" label={t('history.map.zoomOut')} onPress={() => zoomBy(1 / BUTTON_ZOOM)} />
        <RoundButton testID="map-reset" glyph="reset" label={t('history.map.reset')} onPress={reset} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
  controls: { position: 'absolute', top: 10, right: 10, gap: 8 },
});
