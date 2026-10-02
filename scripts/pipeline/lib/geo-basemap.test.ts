import { describe, expect, it } from 'vitest';

import { buildBaseMap, type GeoCollection, type GeoFeature } from './geo-basemap';
import { makeProjection } from './geo-projection';
import { decodePath, pointInRings } from './geo-shapes';

const poly = (props: Record<string, unknown>, ring: number[][]): GeoFeature => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
});
const line = (props: Record<string, unknown>, coords: number[][]): GeoFeature => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
const fc = (...features: GeoFeature[]): GeoCollection => ({ features });

// A 10° × 10° map at lat0 = 0 and k = 10: 100 × 100 units.
const proj = makeProjection([0, 0, 10, 10], 0, 10);

describe('buildBaseMap', () => {
  const build = buildBaseMap(
    {
      // Land crossing the west edge, plus a tiny islet below the area threshold.
      land: fc(
        poly({ featurecla: 'Land' }, [[-5, 1], [6, 1], [6, 9], [-5, 9]]),
        poly({ featurecla: 'Land' }, [[8, 8], [8.01, 8], [8.01, 8.01]]),
        poly({ featurecla: 'Land' }, [[20, 20], [21, 20], [21, 21]]),
      ),
      lakes: fc(
        poly({ featurecla: 'Lake', name: 'Sea of Galilee' }, [[2, 4], [3, 4], [3, 5], [2, 5]]),
        poly({ featurecla: 'Reservoir', name: 'Lake Nasser' }, [[4, 2], [5, 2], [5, 3], [4, 3]]),
      ),
      rivers: fc(
        line({ featurecla: 'River', name: 'Jordan' }, [[2.5, 8], [2.5, 6], [2.5, 5.2]]),
        line({ featurecla: 'Lake Centerline', name: 'Jordan' }, [[2.5, 5], [2.5, 4.5], [2.5, 4]]),
        line({ featurecla: 'Lake Centerline', name: 'Nile' }, [[4.5, 3.5], [4.5, 2.5], [4.5, 1.5]]),
        line({ featurecla: 'River', name: 'Suez Canal' }, [[7, 1], [7, 5]]),
      ),
      marine: fc(poly({ featurecla: 'sea', name: 'Mediterranean Sea' }, [[6, 0], [12, 0], [12, 10], [6, 10]])),
    },
    {
      proj,
      tolerance: { land: 0.1, lakes: 0.05, rivers: 0.05 },
      minArea: { land: 0.02, lakes: 0.02 },
      seas: [
        ['Mediterranean Sea', 'marine', 'Mediterranean Sea'],
        ['Sea of Galilee', 'lakes', 'Sea of Galilee'],
      ],
    },
  );

  it('records the projection and clips land to the map', () => {
    expect(build.map).toMatchObject({ bbox: [0, 0, 10, 10], width: 100, height: 100, lat0: 0 });
    const land = decodePath(build.map.land);
    expect(land).toHaveLength(1);
    expect(Math.min(...land[0].map((p) => p[0]))).toBe(0);
    expect(build.stats.droppedSmallRings).toBe(1);
  });

  it('drops reservoirs and canals but keeps lake centerlines through dropped reservoirs', () => {
    expect(build.stats.droppedReservoirs).toEqual(['Lake Nasser']);
    expect(build.stats.droppedCanals).toEqual(['Suez Canal']);
    expect(build.stats.droppedLakeCenterlines).toEqual(['Jordan']);
    expect(build.riverNames).toEqual(['Jordan', 'Nile']);
    expect(decodePath(build.map.lakes)).toHaveLength(1);
  });

  it('places sea labels inside their water body', () => {
    const med = build.map.seas.find((s) => s.name === 'Mediterranean Sea')!;
    expect(med.x).toBeGreaterThan(60);
    const gal = build.map.seas.find((s) => s.name === 'Sea of Galilee')!;
    expect(pointInRings([gal.x, gal.y], decodePath(build.map.lakes))).toBe(true);
  });
});
