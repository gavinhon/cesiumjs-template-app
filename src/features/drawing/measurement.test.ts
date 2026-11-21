import * as Cesium from 'cesium';
import { describe, expect, it } from 'vitest';
import {
  describeDirect,
  describeElevation,
  describeHeight,
  describeHorizontal,
  describePath,
  formatDistance,
  groundDistance,
  heightOf,
  heightTriangleCorner,
  horizontalDiffers,
  levelPath,
  pointAlong,
  slantDistance,
} from './measurement';

/** A point near Singapore, `east` metres east and `up` metres above the ellipsoid. */
function at(east: number, up: number): Cesium.Cartesian3 {
  const metresPerDegree = 111_320 * Math.cos(Cesium.Math.toRadians(1.35));
  return Cesium.Cartesian3.fromDegrees(103.8 + east / metresPerDegree, 1.35, up);
}

describe('formatDistance', () => {
  it('uses metres with one decimal below a kilometre', () => {
    expect(formatDistance(0)).toBe('0.0 m');
    expect(formatDistance(999.94)).toBe('999.9 m');
  });

  it('switches to kilometres with two decimals from 1000 m', () => {
    expect(formatDistance(1000)).toBe('1.00 km');
    expect(formatDistance(12_345)).toBe('12.35 km');
  });

  it('never prints "1000.0 m" for a value just under a kilometre', () => {
    expect(formatDistance(999.97)).toBe('1.00 km');
  });
});

describe('distances', () => {
  it('agree on level ground', () => {
    const path = [at(0, 10), at(100, 10)];
    expect(slantDistance(path)).toBeCloseTo(100, 0);
    expect(groundDistance(path)).toBeCloseTo(100, 0);
  });

  it('differ when the path climbs: slant is the hypotenuse, ground ignores height', () => {
    const path = [at(0, 0), at(30, 40)];
    expect(slantDistance(path)).toBeCloseTo(50, 0);
    expect(groundDistance(path)).toBeCloseTo(30, 0);
  });

  it('sum every segment of a multi-vertex path', () => {
    const path = [at(0, 0), at(100, 0), at(250, 0)];
    expect(slantDistance(path)).toBeCloseTo(250, 0);
    expect(groundDistance(path)).toBeCloseTo(250, 0);
  });
});

describe('describePath', () => {
  it('shows one number on flat ground', () => {
    expect(describePath([at(0, 10), at(30, 10.4)])).toBe('30.0 m');
  });

  it('hides a horizontal distance that differs only by terrain noise', () => {
    // The readout this replaced printed "30.1 m 3D · 30.0 m ground" here.
    expect(describePath([at(0, 10), at(30, 12)])).not.toContain('horizontal');
  });

  it('adds the horizontal distance once the path climbs noticeably', () => {
    expect(describePath([at(0, 0), at(30, 40)])).toBe('50.0 m · 30.0 m horizontal');
  });

  it('reads zero for a path with fewer than two points', () => {
    expect(describePath([at(0, 0)])).toBe('0.0 m');
  });
});

describe('the level line', () => {
  it('flattens the path to its lowest vertex', () => {
    const level = levelPath([at(0, 40), at(30, 5), at(60, 20)]);
    expect(level.map((point) => heightOf(point))).toEqual([
      expect.closeTo(5, 4),
      expect.closeTo(5, 4),
      expect.closeTo(5, 4),
    ]);
  });

  it('is only worth drawing once the path climbs', () => {
    expect(horizontalDiffers([at(0, 10), at(30, 10.4)])).toBe(false);
    expect(horizontalDiffers([at(0, 0), at(30, 40)])).toBe(true);
    expect(horizontalDiffers([at(0, 0)])).toBe(false);
  });

  it('labels each line with its own distance', () => {
    const path = [at(0, 0), at(30, 40)];
    expect(describeDirect(path)).toBe('50.0 m');
    expect(describeHorizontal(path)).toBe('30.0 m horizontal');
  });
});

describe('pointAlong', () => {
  it('finds the point a fraction of the way along a path, by length', () => {
    const path = [at(0, 0), at(100, 0), at(100 + 300, 0)];
    // Halfway along 400 m is 200 m: 100 m into the second segment.
    expect(Cesium.Cartesian3.distance(pointAlong(path, 0.5), at(200, 0))).toBeLessThan(0.01);
    expect(pointAlong(path, 0)).toEqual(path[0]);
    expect(Cesium.Cartesian3.distance(pointAlong(path, 1), path[2])).toBeLessThan(0.01);
  });
});

describe('describeHeight', () => {
  it('says "up" when the second point is higher', () => {
    expect(describeHeight(at(0, 5), at(11, 15.2))).toBe('10.2 m up · 11.0 m horizontal');
  });

  it('says "down" when the second point is lower, without a minus sign', () => {
    expect(describeHeight(at(0, 150), at(1500, 20))).toBe('130.0 m down · 1.50 km horizontal');
  });
});

describe('heightTriangleCorner', () => {
  it('sits directly over the first point, at the second point’s height', () => {
    const from = at(0, 5);
    const to = at(40, 25);
    const corner = Cesium.Cartographic.fromCartesian(heightTriangleCorner(from, to));
    const base = Cesium.Cartographic.fromCartesian(from);
    expect(corner.longitude).toBeCloseTo(base.longitude, 12);
    expect(corner.latitude).toBeCloseTo(base.latitude, 12);
    expect(corner.height).toBeCloseTo(heightOf(to), 4);
  });
});

describe('describeElevation', () => {
  it('labels the height as ellipsoidal, not sea level', () => {
    expect(describeElevation(at(0, 167.4))).toBe('167.4 m (WGS84)');
  });
});
