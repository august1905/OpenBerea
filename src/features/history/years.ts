import { type MessageKey, t } from '@/i18n';
import { fromCompact } from '@/lib/bible/refs';
import type { Ruler, TimelineEvent } from '@/lib/data/types';

// Years in the Theographic data are normalized so that negative means BC (−1015 = 1015 BC) and there
// is no year 0. Dates follow Floyd Nolen Jones's chronology, so every date is shown as approximate.

const isBC = (y: number) => y <= 0;
const bcNumber = (y: number) => Math.max(1, -y);

/** "1015 BC", "AD 30". */
export function formatYear(y: number): string {
  return isBC(y) ? t('history.year.bc', { n: bcNumber(y) }) : t('history.year.ad', { n: y });
}

/** "1055–1015 BC", "AD 53–55", "4 BC – AD 30", or a single year when start and end match. */
export function formatSpan(start: number, end?: number): string {
  if (end === undefined || end === start) return formatYear(start);
  const [a, b] = start <= end ? [start, end] : [end, start];
  if (isBC(a) && isBC(b)) return t('history.year.bcRange', { a: bcNumber(a), b: bcNumber(b) });
  if (!isBC(a) && !isBC(b)) return t('history.year.adRange', { a, b });
  return t('history.year.range', { a: formatYear(a), b: formatYear(b) });
}

/** "c. 1055–1015 BC". */
export function approx(start: number, end?: number): string {
  return t('history.year.approx', { date: formatSpan(start, end) });
}

// ---------------------------------------------------------------------------------------------
// Eras for the event list. Boundaries follow the same chronology (Flood 2348 BC, Abraham born
// 1997 BC, Jacob's family enters Egypt 1706 BC, Moses dies 1451 BC, Saul 1095 BC, the kingdom
// divides 975 BC, Jerusalem falls 586 BC). From 6 BC on, events told in the Gospels belong to the
// life of Christ and the rest to the early church.

export const ERAS = ['beginnings', 'nations', 'patriarchs', 'egypt', 'judges', 'united', 'divided', 'exile', 'christ', 'church'] as const;
export type Era = (typeof ERAS)[number];

const BOUNDARIES: [Era, number][] = [
  ['beginnings', -2348],
  ['nations', -1997],
  ['patriarchs', -1706],
  ['egypt', -1451],
  ['judges', -1095],
  ['united', -975],
  ['divided', -586],
  ['exile', -6],
];

const GOSPELS = new Set(['MAT', 'MRK', 'LUK', 'JHN']);

export function eraOf(e: Pick<TimelineEvent, 'start' | 'refs'>): Era {
  for (const [era, before] of BOUNDARIES) if (e.start < before) return era;
  const first = e.refs?.[0] ? fromCompact(e.refs[0]) : null;
  return first && !GOSPELS.has(first.book) ? 'church' : 'christ';
}

export function eraLabel(era: Era): string {
  return t(`history.era.${era}` as MessageKey);
}

/** Events grouped by era, in chronological order (the source order breaks ties). */
export function groupByEra(events: TimelineEvent[]): { era: Era; events: TimelineEvent[] }[] {
  const sorted = events.map((e, i) => [e, i] as const).sort((a, b) => a[0].start - b[0].start || a[1] - b[1]);
  const groups = new Map<Era, TimelineEvent[]>();
  for (const [e] of sorted) {
    const era = eraOf(e);
    const list = groups.get(era);
    if (list) list.push(e);
    else groups.set(era, [e]);
  }
  return ERAS.filter((era) => groups.has(era)).map((era) => ({ era, events: groups.get(era)! }));
}

// ---------------------------------------------------------------------------------------------
// Lane chart (kings and prophets)

export const LANES = ['united', 'judah', 'israel', 'prophet'] as const;
export type Lane = (typeof LANES)[number];

/** The years a bar covers. A reign without an end year (some lasted months) shows as one year. */
export function barYears(r: Pick<Ruler, 'start' | 'end'>): [number, number] {
  return [r.start, Math.max(r.end ?? r.start + 1, r.start + 1)];
}

/**
 * First-fit row packing: each item goes in the first row whose last item ends (plus `gap`) before
 * it starts. Extents include the label, so labels never overlap. Returns a row index per item.
 */
export function packRows(extents: [number, number][], gap = 0): number[] {
  const order = extents.map((_, i) => i).sort((a, b) => extents[a][0] - extents[b][0] || a - b);
  const rowEnds: number[] = [];
  const rows = new Array<number>(extents.length);
  for (const i of order) {
    const [x0, x1] = extents[i];
    let row = rowEnds.findIndex((end) => end + gap <= x0);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(x1);
    } else {
      rowEnds[row] = x1;
    }
    rows[i] = row;
  }
  return rows;
}

/** Axis range rounded out to whole steps, e.g. [-1100, -400]. */
export function axisRange(rulers: Pick<Ruler, 'start' | 'end'>[], step: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rulers) {
    const [a, b] = barYears(r);
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

/** Tick years from lo to hi inclusive. */
export function ticks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) out.push(y);
  return out;
}
