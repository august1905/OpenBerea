import { describe, expect, it } from 'vitest';

import { paletteFor } from './palette';

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function parse(color: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  throw new Error(`Unparsed color ${color}`);
}

function over(top: string, bottom: string): string {
  const [r, g, b, a] = parse(top);
  const [r2, g2, b2] = parse(bottom);
  const mix = (x: number, y: number) => Math.round(x * a + y * (1 - a));
  return `#${[mix(r, r2), mix(g, g2), mix(b, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(color: string) {
  const [r, g, b] = parse(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('palette', () => {
  it('uses the spec colors in the default light theme', () => {
    const p = paletteFor('light', false);
    expect(p.bg).toBe('#FFFAE1');
    expect(p.text).toBe('#1C1A17');
    expect(p.gold).toBe('#A87A22');
    expect(p.peach).toBe('#F2A06B');
    const d = paletteFor('dark', false);
    expect(d.text).toBe('#FFFAE1');
    expect(d.gold).toBe('#A87A22');
    expect(d.peach).toBe('#F2A06B');
  });

  for (const scheme of ['light', 'dark'] as const) {
    for (const hc of [false, true]) {
      const p = paletteFor(scheme, hc);
      const label = `${scheme}${hc ? ' high contrast' : ''}`;
      it(`${label}: text colors meet WCAG contrast`, () => {
        for (const bg of [p.bg, p.surface]) {
          expect(contrast(p.text, bg)).toBeGreaterThanOrEqual(hc ? 15 : 7);
          expect(contrast(p.muted, bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(p.redLetter, bg)).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(p.text, over(p.highlight, p.bg))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.redLetter, over(p.highlight, p.bg))).toBeGreaterThanOrEqual(4.5);
      });
      it(`${label}: gold is visible as a non-text accent (3:1)`, () => {
        expect(contrast(p.gold, p.bg)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
