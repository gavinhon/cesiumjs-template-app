import * as Cesium from 'cesium';
import { describe, expect, it } from 'vitest';
import { describeViewshed, rimPositions, traceVisibility } from './viewshed';

const EYE = 1.7;

/** One ray of terrain heights, nearest sample first. */
function ray(heights: number[]) {
  return traceVisibility(heights, 1, heights.length, 10, EYE);
}

describe('traceVisibility', () => {
  it('sees every sample of flat ground near the observer', () => {
    const { visible, visibleFraction } = ray(new Array(50).fill(0));
    expect(Array.from(visible)).toEqual(new Array(50).fill(1));
    expect(visibleFraction).toBe(1);
  });

  it('hides ground behind a wall but not the wall itself', () => {
    //               10m 20m 30m  40m 50m 60m
    const { visible } = ray([0, 0, 20, 0, 0, 0]);
    expect(Array.from(visible)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it('sees a hillside that rises above the wall’s sight line again', () => {
    // From 1.7 m, a 5 m wall at 10 m sets a slope of 0.33; 40 m up at
    // 60 m out (slope 0.64) clears it.
    const { visible } = ray([5, 0, 0, 0, 0, 40]);
    expect(Array.from(visible)).toEqual([1, 0, 0, 0, 0, 1]);
  });

  it('drops flat ground past the horizon (about 5 km for a standing person)', () => {
    const { visible } = traceVisibility(new Array(800).fill(0), 1, 800, 10, EYE);
    expect(visible[299]).toBe(1); // 3 km
    expect(visible[799]).toBe(0); // 8 km
  });

  it('keeps rays independent: a wall on one ray hides nothing on another', () => {
    const ground = [0, 20, 0, /* ray 2 */ 0, 0, 0];
    const { visible } = traceVisibility(ground, 2, 3, 10, EYE);
    expect(Array.from(visible)).toEqual([1, 1, 0, 1, 1, 1]);
  });

  it('weights the visible fraction by area, so far samples count for more', () => {
    // Hidden: only the farthest of three samples, which stands for 3/6 of the area.
    const { visibleFraction } = ray([0, 20, 0]);
    expect(visibleFraction).toBeCloseTo(3 / 6, 6);
  });
});

describe('rimPositions', () => {
  it('returns a closed ring of points at the radius', () => {
    const center = Cesium.Cartesian3.fromDegrees(103.8, 1.35, 50);
    const ring = rimPositions(center, 1000);
    expect(Cesium.Cartesian3.equalsEpsilon(ring[0], ring[ring.length - 1], 0, 1e-6)).toBe(true);
    for (const point of ring) {
      // Measured along the ground: the ring is drawn draped on the surface.
      // Within half a metre — a spherical-earth version was 6 m short here.
      const geodesic = new Cesium.EllipsoidGeodesic(
        Cesium.Cartographic.fromCartesian(center),
        Cesium.Cartographic.fromCartesian(point),
      );
      expect(geodesic.surfaceDistance).toBeCloseTo(1000, 0);
    }
  });
});

describe('describeViewshed', () => {
  it('rounds the share to a whole percent and formats the radius', () => {
    expect(describeViewshed(0.224, 876)).toBe('22% visible · 876.0 m radius');
    expect(describeViewshed(1, 1500)).toBe('100% visible · 1.50 km radius');
  });
});
