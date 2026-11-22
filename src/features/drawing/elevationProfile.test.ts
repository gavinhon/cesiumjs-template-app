import * as Cesium from 'cesium';
import { describe, expect, it } from 'vitest';
import { profilePaths, profileStats, samplePath } from './elevationProfile';

const at = (lon: number, lat: number) => Cesium.Cartesian3.fromDegrees(lon, lat);

describe('samplePath', () => {
  it('spreads samples evenly by distance and includes both ends', () => {
    const { cartographics, distances } = samplePath([at(103.8, 1.3), at(103.82, 1.3)], 5);
    expect(cartographics).toHaveLength(5);
    expect(distances[0]).toBe(0);
    const step = distances[1] - distances[0];
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i] - distances[i - 1]).toBeCloseTo(step, 6);
    }
    expect(Cesium.Math.toDegrees(cartographics[4].longitude)).toBeCloseTo(103.82, 9);
    expect(Cesium.Math.toDegrees(cartographics[2].longitude)).toBeCloseTo(103.81, 6);
  });

  it('gives a long segment more samples than a short one', () => {
    // 2 km east, then 0.5 km north: 4 of the 5 gaps fall on the first leg.
    const { cartographics } = samplePath(
      [at(103.8, 1.3), at(103.818, 1.3), at(103.818, 1.3045)],
      6,
    );
    const onFirstLeg = cartographics.filter(
      (c) => Math.abs(Cesium.Math.toDegrees(c.latitude) - 1.3) < 1e-9,
    );
    expect(onFirstLeg.length).toBe(5);
    expect(Cesium.Math.toDegrees(cartographics[5].latitude)).toBeCloseTo(1.3045, 9);
  });

  it('leaves a single point alone', () => {
    expect(samplePath([at(103.8, 1.3)], 10).cartographics).toHaveLength(1);
  });
});

describe('profileStats', () => {
  it('sums every rise and every fall separately', () => {
    expect(profileStats([10, 30, 20, 50, 40])).toEqual({
      min: 10,
      max: 50,
      climb: 50,
      descent: 20,
    });
  });
});

describe('profilePaths', () => {
  it('fills the box edge to edge, highest point at the top', () => {
    const { line, area } = profilePaths([0, 50, 100], [0, 100, 50], 200, 80);
    expect(line).toBe('M0.0,80.0 L100.0,0.0 L200.0,40.0');
    expect(area).toBe(`${line} L200,80 L0,80 Z`);
  });

  it('keeps a nearly flat path looking flat', () => {
    // A 1 m wobble on a 10 m minimum scale stays in the middle tenth.
    const { line } = profilePaths([0, 100], [5, 6], 100, 100);
    expect(line).toBe('M0.0,55.0 L100.0,45.0');
  });
});
