import { describe, expect, it } from 'vitest';

import type { TimelineEvent } from '@/lib/data/types';

import { approx, axisRange, barYears, eraOf, formatSpan, formatYear, groupByEra, packRows, ticks } from './years';

describe('year formatting', () => {
  it('formats BC and AD years', () => {
    expect(formatYear(-1015)).toBe('1015 BC');
    expect(formatYear(-4)).toBe('4 BC');
    expect(formatYear(30)).toBe('AD 30');
  });

  it('formats spans within and across eras', () => {
    expect(formatSpan(-1055, -1015)).toBe('1055–1015 BC');
    expect(formatSpan(53, 55)).toBe('AD 53–55');
    expect(formatSpan(-4, 30)).toBe('4 BC – AD 30');
    expect(formatSpan(-975)).toBe('975 BC');
    expect(formatSpan(-975, -975)).toBe('975 BC');
  });

  it('marks dates as approximate', () => {
    expect(approx(-1085)).toBe('c. 1085 BC');
    expect(approx(-975, -958)).toBe('c. 975–958 BC');
  });
});

describe('eras', () => {
  const ev = (id: string, start: number, refs: string[] = []): TimelineEvent => ({ id, title: id, start, refs });

  it('assigns Old Testament events by date', () => {
    expect(eraOf(ev('creation', -4004))).toBe('beginnings');
    expect(eraOf(ev('flood', -2348))).toBe('nations');
    expect(eraOf(ev('abraham', -1997))).toBe('patriarchs');
    expect(eraOf(ev('moses', -1571))).toBe('egypt');
    expect(eraOf(ev('gideon', -1251))).toBe('judges');
    expect(eraOf(ev('david', -1055))).toBe('united');
    expect(eraOf(ev('rehoboam', -975))).toBe('divided');
    expect(eraOf(ev('malachi', -442))).toBe('exile');
  });

  it('splits the New Testament by where the event is told', () => {
    expect(eraOf(ev('baptism', 26, ['MAT.3.13-17']))).toBe('christ');
    expect(eraOf(ev('pentecost', 30, ['ACT.2.1-41']))).toBe('church');
  });

  it('groups in chronological order, keeping source order for ties', () => {
    const groups = groupByEra([ev('b', -975), ev('a', -1055), ev('c', -975), ev('d', 30, ['ACT.1.1'])]);
    expect(groups.map((g) => g.era)).toEqual(['united', 'divided', 'church']);
    expect(groups[1].events.map((e) => e.id)).toEqual(['b', 'c']);
  });
});

describe('lane chart', () => {
  it('gives reigns without an end year one year', () => {
    expect(barYears({ start: -609 })).toEqual([-609, -608]);
    expect(barYears({ start: -975, end: -958 })).toEqual([-975, -958]);
  });

  it('packs overlapping bars into rows', () => {
    // Jehoshaphat, Jehoram (overlapping), Ahaziah, Athaliah (same start as Ahaziah).
    const rows = packRows([
      [-914, -889],
      [-893, -885],
      [-886, -885],
      [-886, -879],
    ]);
    expect(rows).toEqual([0, 1, 0, 2]);
  });

  it('leaves a gap between neighbours in a row', () => {
    expect(packRows([[0, 10], [10, 20]], 0)).toEqual([0, 0]);
    expect(packRows([[0, 10], [10, 20]], 4)).toEqual([0, 1]);
  });

  it('rounds the axis out to whole steps', () => {
    expect(axisRange([{ start: -1095, end: -1055 }, { start: -442, end: -441 }], 50)).toEqual([-1100, -400]);
    expect(ticks(-1100, -1000, 50)).toEqual([-1100, -1050, -1000]);
  });
});
