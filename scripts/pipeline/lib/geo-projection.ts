// Base-map projection: equirectangular with longitudes scaled by cos(lat0).
//
//   k = height / (north − south)                  (map units per degree of latitude)
//   x = (lon − west) × cos(lat0 × π / 180) × k
//   y = (north − lat) × k
//
// naturalearth/base.json stores bbox [west, south, east, north], lat0, width and height, so the
// app can recompute k and place markers with the same one-line formula. For the shipped map
// k = 20 exactly (height 600 for 30° of latitude), and width = 60 × cos 30° × 20 ≈ 1039.2.
import type { BaseMap } from '../../../src/lib/data/types';

export type BBox = [west: number, south: number, east: number, north: number];

export interface Projection {
  bbox: BBox;
  lat0: number;
  /** Map units per degree of latitude. */
  k: number;
  width: number;
  height: number;
}

export const BASEMAP_BBOX: BBox = [5, 15, 65, 45];
export const BASEMAP_LAT0 = 30;
/** Chosen so that width ≈ 1040: 60° × cos 30° × 20 = 1039.2. */
export const BASEMAP_K = 20;

export function makeProjection(bbox: BBox, lat0: number, k: number): Projection {
  const [west, south, east, north] = bbox;
  return { bbox, lat0, k, width: (east - west) * Math.cos((lat0 * Math.PI) / 180) * k, height: (north - south) * k };
}

/** Projects a longitude/latitude to map units. Pure; also valid outside the bbox. */
export function projectLonLat(lon: number, lat: number, p: Pick<Projection, 'bbox' | 'lat0' | 'k'>): [number, number] {
  return [(lon - p.bbox[0]) * Math.cos((p.lat0 * Math.PI) / 180) * p.k, (p.bbox[3] - lat) * p.k];
}

/** The scale k implied by a BaseMap's fields (what the app should use). */
export function scaleOf(map: Pick<BaseMap, 'bbox' | 'height'>): number {
  return map.height / (map.bbox[3] - map.bbox[1]);
}

export const BASEMAP_PROJECTION = makeProjection(BASEMAP_BBOX, BASEMAP_LAT0, BASEMAP_K);
