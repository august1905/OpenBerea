import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Sheet } from '@/components/Sheet';
import { Body, Heading } from '@/components/ui';
import { type MessageKey, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import type { Ruler } from '@/lib/data/types';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { refHref } from '../nav/hrefs';
import { personHref } from './hrefs';
import { RoundButton, TextLink } from './parts';
import { textWidth } from './projection';
import { approx, axisRange, barYears, formatYear, LANES, packRows, ticks } from './years';

// Kings and prophets on a BC year axis: one lane each for the United Kingdom, Judah, Israel, and the
// prophets. Bars run from the start to the end year; overlapping reigns stack into extra rows, and
// rows are packed with the label width included, so names never overlap. Scrolls sideways on phones.

const ZOOMS = [1.5, 2, 3, 4, 6, 8];
const STEP = 50;
const ROW = 44;
const BAR = 8;
const LANE_PAD = 8;
const AXIS = 30;
const FONT = 13;

interface Item {
  r: Ruler;
  x: number;
  w: number;
  extent: number;
  row: number;
}

function layout(rulers: Ruler[], lo: number, ppy: number) {
  return LANES.map((lane) => {
    const list = rulers.filter((r) => r.group === lane).sort((a, b) => a.start - b.start);
    const raw = list.map((r) => {
      const [a, b] = barYears(r);
      const x = (a - lo) * ppy;
      const w = Math.max(4, (b - a) * ppy);
      // Generous label width (Inter runs wider than the estimate for some names), so none is cut off.
      return { r, x, w, extent: Math.max(w, textWidth(r.name, FONT) * 1.15 + 10) };
    });
    const rows = packRows(raw.map((i): [number, number] => [i.x, i.x + i.extent]), 10);
    const items: Item[] = raw.map((i, k) => ({ ...i, row: rows[k] }));
    const count = Math.max(1, ...rows.map((n) => n + 1));
    return { lane, items, height: count * ROW + LANE_PAD * 2 };
  });
}

export function LaneChart({ rulers }: { rulers: Ruler[] }) {
  const { palette, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 600;
  // Phones start zoomed out, so the first screen already reaches the divided kingdom.
  const [zoom, setZoom] = useState(narrow ? 0 : 2);
  const [open, setOpen] = useState<Ruler | null>(null);
  const ppy = ZOOMS[zoom];
  const [lo, hi] = useMemo(() => axisRange(rulers, STEP), [rulers]);
  const lanes = useMemo(() => layout(rulers, lo, ppy), [rulers, lo, ppy]);
  const contentWidth = (hi - lo) * ppy + 24;
  const left = narrow ? 78 : 112;
  const totalHeight = lanes.reduce((n, l) => n + l.height, 0);

  return (
    <View testID="lane-chart">
      <View style={styles.toolbar}>
        <Body muted style={{ flex: 1, fontSize: 14 }}>
          {t('history.timeline.chartHint')}
        </Body>
        <View style={styles.zoom}>
          <RoundButton testID="timeline-zoom-out" glyph="minus" label={t('history.timeline.zoomOut')} onPress={() => setZoom((z) => Math.max(0, z - 1))} />
          <RoundButton testID="timeline-zoom-in" glyph="plus" label={t('history.timeline.zoomIn')} onPress={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} />
        </View>
      </View>
      <View
        style={[styles.frame, { borderColor: palette.rule }]}
        role="group"
        aria-label={t('history.timeline.chartLabel', { from: formatYear(lo), to: formatYear(hi) })}
      >
        {/* Lane names stay put while the years scroll. */}
        <View style={[styles.names, { width: left, borderColor: palette.rule }]} aria-hidden>
          <View style={{ height: AXIS }} />
          {lanes.map((l) => (
            <View key={l.lane} style={[styles.name, { height: l.height, borderColor: palette.rule }]}>
              <Text style={{ color: palette.text, fontFamily: fonts.ui, fontWeight: '600', fontSize: narrow ? 13 : 14 }}>
                {t(`history.lane.${l.lane}` as MessageKey)}
              </Text>
            </View>
          ))}
        </View>
        <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ width: contentWidth }}>
          <View style={{ width: contentWidth }}>
            {/* Axis and gridlines */}
            <View style={{ height: AXIS }}>
              {ticks(lo, hi, STEP).map((y) => (
                <Text
                  key={y}
                  aria-hidden
                  style={[styles.tick, { left: (y - lo) * ppy + 4, color: palette.muted, fontFamily: fonts.ui }]}
                  numberOfLines={1}
                >
                  {formatYear(y)}
                </Text>
              ))}
            </View>
            {ticks(lo, hi, STEP).map((y) => (
              <View
                key={y}
                aria-hidden
                style={[styles.grid, { left: (y - lo) * ppy, top: 6, height: totalHeight + AXIS - 6, backgroundColor: palette.rule }]}
              />
            ))}
            {lanes.map((l) => (
              <View
                key={l.lane}
                testID={`lane-${l.lane}`}
                role="group"
                aria-label={t(`history.lane.${l.lane}` as MessageKey)}
                style={[styles.lane, { height: l.height, borderColor: palette.rule }]}
              >
                {l.items.map((i) => (
                  <Bar key={`${i.r.person}-${i.r.start}`} item={i} onPress={() => setOpen(i.r)} />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <RulerSheet ruler={open} onClose={() => setOpen(null)} />
    </View>
  );
}

function Bar({ item, onPress }: { item: Item; onPress: () => void }) {
  const { palette, fonts } = useTheme();
  const { r } = item;
  const role = t(`history.ruler.role.${r.group}` as MessageKey);
  return (
    <Pressable
      testID={`ruler-${r.person}`}
      accessibilityRole="button"
      accessibilityLabel={t('history.ruler.bar', { name: r.name, role, date: approx(...barSpan(r)) })}
      onPress={onPress}
      style={pressStyle(({ hovered, focused, pressed }) => [
        styles.bar,
        { left: item.x, top: LANE_PAD + item.row * ROW, width: item.extent },
        (hovered || focused || pressed) && { backgroundColor: palette.highlight },
      ])}
    >
      <Text numberOfLines={1} style={{ color: palette.text, fontFamily: fonts.ui, fontSize: FONT, lineHeight: 18 }}>
        {r.name}
      </Text>
      <View style={[styles.fill, { width: item.w, backgroundColor: palette.gold }]} />
    </Pressable>
  );
}

/** The data's own end year (no padding for reigns that lasted months). */
function barSpan(r: Ruler): [number, number | undefined] {
  return [r.start, r.end];
}

function RulerSheet({ ruler, onClose }: { ruler: Ruler | null; onClose: () => void }) {
  const { palette, fonts } = useTheme();
  if (!ruler) return null;
  return (
    <Sheet testID="ruler-sheet" visible title={ruler.name} onClose={onClose}>
      <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 14, fontWeight: '600' }}>
        {t(`history.ruler.role.${ruler.group}` as MessageKey)}
      </Text>
      <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16, marginTop: 6 }}>{approx(ruler.start, ruler.end)}</Text>
      <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13, marginTop: 2 }}>{t('history.credits.dates')}</Text>
      <TextLink testID="ruler-profile" href={personHref(ruler.person)} style={styles.sheetLink}>
        {t('history.ruler.profile', { name: ruler.name })}
      </TextLink>
      {ruler.refs?.length ? (
        <>
          <Heading level={3}>{t('history.ruler.passages')}</Heading>
          <View style={styles.refs}>
            {ruler.refs.map((ref) => (
              <TextLink key={ref} href={refHref(ref)} style={styles.sheetLink}>
                {formatRef(ref)}
              </TextLink>
            ))}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  zoom: { flexDirection: 'row', gap: 8 },
  frame: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
  names: { borderRightWidth: StyleSheet.hairlineWidth },
  name: { justifyContent: 'center', paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth },
  tick: { position: 'absolute', top: 8, fontSize: 12, width: 80 },
  grid: { position: 'absolute', width: StyleSheet.hairlineWidth },
  lane: { borderTopWidth: StyleSheet.hairlineWidth },
  bar: { position: 'absolute', height: ROW, justifyContent: 'center', paddingTop: 2, borderRadius: 6 },
  fill: { height: BAR, borderRadius: BAR / 2, marginTop: 4 },
  sheetLink: { fontSize: 15, paddingVertical: 11 },
  refs: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
});
