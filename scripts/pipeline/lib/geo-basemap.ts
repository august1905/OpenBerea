// Builds the pre-projected base map (naturalearth/base.json) from Natural Earth GeoJSON layers:
// land and lakes as filled rings, rivers as lines, and sea-name label points.
import type { BaseMap } from '../../../src/lib/data/types';
import { type Projection, projectLonLat } from './geo-projection';
import {
  clipLine,
  clipRing,
  encodePath,
  labelPoint,
  orient,
  pointInRings,
  type Pt,
  type Ring,
  ringArea,
  simplifyLine,
  simplifyRing,
} from './geo-shapes';

export interface GeoFeature {
  type: 'Feature';
  properties: Record<string, unknown> | null;
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
    | { type: 'LineString'; coordinates: number[][] }
    | { type: 'MultiLineString'; coordinates: number[][][] }
    | { type: string; coordinates: unknown }
    | null;
}

export interface GeoCollection {
  features: GeoFeature[];
}

export interface BaseMapOptions {
  proj: Projection;
  /** Douglas–Peucker tolerance per layer, in map units. */
  tolerance: { land: number; lakes: number; rivers: number };
  /** Rings with a smaller area (map units², before simplification) are dropped. */
  minArea: { land: number; lakes: number };
  /** Sea labels: [label, source layer, feature name in that layer]. */
  seas: [string, 'marine' | 'lakes', string][];
}

export interface BaseMapBuild {
  map: BaseMap;
  /** Kept shapes in map units (after simplification, before rounding). */
  land: Ring[];
  lakes: Ring[];
  rivers: Pt[][];
  /** The same layers clipped but not simplified, for verification. */
  original: { land: Ring[]; lakes: Ring[]; rivers: { name: string; line: Pt[] }[] };
  riverNames: string[];
  stats: {
    landRings: number;
    lakeRings: number;
    riverLines: number;
    droppedSmallRings: number;
    droppedReservoirs: string[];
    droppedCanals: string[];
    droppedLakeCenterlines: string[];
    pointsIn: number;
    pointsOut: number;
    seaSources: Record<string, string>;
  };
}

const name = (f: GeoFeature) => (typeof f.properties?.name === 'string' ? f.properties.name : '');
const cla = (f: GeoFeature) => (typeof f.properties?.featurecla === 'string' ? f.properties.featurecla : '');

function polygonsOf(f: GeoFeature): number[][][][] {
  const g = f.geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates as number[][][]];
  if (g.type === 'MultiPolygon') return g.coordinates as number[][][][];
  return [];
}

function linesOf(f: GeoFeature): number[][][] {
  const g = f.geometry;
  if (!g) return [];
  if (g.type === 'LineString') return [g.coordinates as number[][]];
  if (g.type === 'MultiLineString') return g.coordinates as number[][][];
  return [];
}

function touchesBox(coords: number[][], bbox: Projection['bbox']): boolean {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return e >= bbox[0] && w <= bbox[2] && n >= bbox[1] && s <= bbox[3];
}

/** Projects and clips each polygon ring; outer rings first in each polygon. */
function clippedRings(features: GeoFeature[], proj: Projection): { ring: Ring; outer: boolean }[] {
  const out: { ring: Ring; outer: boolean }[] = [];
  for (const f of features) {
    for (const poly of polygonsOf(f)) {
      poly.forEach((coords, ri) => {
        if (!touchesBox(coords, proj.bbox)) return;
        const open = coords.length > 1 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
          ? coords.slice(0, -1)
          : coords;
        const ring = clipRing(open.map(([lon, lat]) => projectLonLat(lon, lat, proj)), proj.width, proj.height);
        if (ring.length) out.push({ ring, outer: ri === 0 });
      });
    }
  }
  return out;
}

function simplifyRings(rings: { ring: Ring; outer: boolean }[], tolerance: number, minArea: number) {
  const kept: Ring[] = [];
  let dropped = 0;
  for (const { ring, outer } of rings) {
    if (Math.abs(ringArea(ring)) < minArea) {
      dropped++;
      continue;
    }
    // Outer rings clockwise on screen, holes counter-clockwise: correct for both fill rules.
    kept.push(orient(simplifyRing(ring, tolerance), outer));
  }
  return { kept, dropped };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function buildBaseMap(
  src: { land: GeoCollection; lakes: GeoCollection; rivers: GeoCollection; marine: GeoCollection },
  opts: BaseMapOptions,
): BaseMapBuild {
  const { proj } = opts;

  // Land.
  const landClipped = clippedRings(src.land.features, proj);
  const land = simplifyRings(landClipped, opts.tolerance.land, opts.minArea.land);

  // Lakes, without modern reservoirs.
  const droppedReservoirs: string[] = [];
  const lakeFeatures = src.lakes.features.filter((f) => {
    if (cla(f) !== 'Reservoir') return true;
    if (f.geometry && polygonsOf(f).some((p) => touchesBox(p[0], proj.bbox))) droppedReservoirs.push(name(f));
    return false;
  });
  const lakesClipped = clippedRings(lakeFeatures, proj);
  const lakes = simplifyRings(lakesClipped, opts.tolerance.lakes, opts.minArea.lakes);

  // Rivers, without canals, and without lake centerlines drawn across lakes we keep.
  const droppedCanals: string[] = [];
  const droppedLakeCenterlines: string[] = [];
  const rivers: Pt[][] = [];
  const riverNames: string[] = [];
  const originalRivers: { name: string; line: Pt[] }[] = [];
  const keptLakeRings = lakesClipped.map((r) => r.ring);
  for (const f of src.rivers.features) {
    const lines = linesOf(f).filter((l) => touchesBox(l, proj.bbox));
    if (!lines.length) continue;
    if (/canal|channel/i.test(name(f))) {
      droppedCanals.push(name(f));
      continue;
    }
    const projected = lines.map((l) => l.map(([lon, lat]) => projectLonLat(lon, lat, proj)));
    if (cla(f) === 'Lake Centerline') {
      const all = projected.flat();
      const mid = all[Math.floor(all.length / 2)];
      if (pointInRings(mid, keptLakeRings)) {
        droppedLakeCenterlines.push(name(f));
        continue;
      }
    }
    for (const line of projected) {
      for (const run of clipLine(line, proj.width, proj.height)) {
        originalRivers.push({ name: name(f), line: run });
        rivers.push(simplifyLine(run, opts.tolerance.rivers));
        riverNames.push(name(f));
      }
    }
  }

  // Sea labels.
  const seas: BaseMap['seas'] = [];
  const seaSources: Record<string, string> = {};
  for (const [label, layer, featureName] of opts.seas) {
    const features = (layer === 'marine' ? src.marine : src.lakes).features.filter((f) => name(f) === featureName);
    // A sea may have several polygons (the Dead Sea's southern basin is separate): label the largest.
    const candidates = clippedRings(features, proj).filter((r) => r.outer);
    if (!candidates.length) throw new Error(`Base map: no ${layer} polygon named ${featureName} in the bbox`);
    const biggest = candidates.reduce((a, b) => (Math.abs(ringArea(b.ring)) > Math.abs(ringArea(a.ring)) ? b : a));
    const p = labelPoint([biggest.ring]);
    if (!p) throw new Error(`Base map: no label point for ${featureName}`);
    seas.push({ name: label, x: round1(p[0]), y: round1(p[1]) });
    seaSources[label] = `${layer === 'marine' ? 'ne_10m_geography_marine_polys' : 'ne_10m_lakes'}: ${featureName}`;
  }

  const count = (shapes: Pt[][]) => shapes.reduce((s, r) => s + r.length, 0);
  const map: BaseMap = {
    bbox: [...proj.bbox],
    width: round1(proj.width),
    height: round1(proj.height),
    lat0: proj.lat0,
    land: encodePath(land.kept, true),
    lakes: encodePath(lakes.kept, true),
    rivers: encodePath(rivers, false),
    seas,
  };
  return {
    map,
    land: land.kept,
    lakes: lakes.kept,
    rivers,
    original: { land: landClipped.map((r) => r.ring), lakes: keptLakeRings, rivers: originalRivers },
    riverNames,
    stats: {
      landRings: land.kept.length,
      lakeRings: lakes.kept.length,
      riverLines: rivers.length,
      droppedSmallRings: land.dropped + lakes.dropped,
      droppedReservoirs,
      droppedCanals,
      droppedLakeCenterlines,
      pointsIn: count(landClipped.map((r) => r.ring)) + count(keptLakeRings) + count(originalRivers.map((r) => r.line)),
      pointsOut: count(land.kept) + count(lakes.kept) + count(rivers),
      seaSources,
    },
  };
}
