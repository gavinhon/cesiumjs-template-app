import { describe, expect, it } from 'vitest';
import { fromSvy21, isWithinSvy21Area, toSvy21 } from './svy21';

describe('toSvy21', () => {
  it('puts the projection origin at the false easting and northing', () => {
    const { northing, easting } = toSvy21(1 + 22 / 60, 103 + 50 / 60);
    expect(northing).toBeCloseTo(38744.572, 3);
    expect(easting).toBeCloseTo(28001.642, 3);
  });

  it('measures true metres near the origin (scale factor 1)', () => {
    const west = toSvy21(1.366666, 103.833333);
    const east = toSvy21(1.366666, 103.843333);
    expect(east.easting - west.easting).toBeCloseTo(1113.0, 0);
    expect(east.northing - west.northing).toBeCloseTo(0, 0);
  });

  it("matches the Singapore Land Authority's own coordinate for Marina Bay Sands", () => {
    const { northing, easting } = toSvy21(1.283454196908438, 103.8608090489553);
    expect(easting).toBeCloseTo(31059.46258557215, 2);
    expect(northing).toBeCloseTo(29543.38041536324, 2);
  });
});

describe('fromSvy21', () => {
  it('inverts toSvy21 to well under a millimetre across the island', () => {
    for (const [lat, lon] of [
      [1.2834, 103.8607],
      [1.3521, 103.8198],
      [1.4419, 103.7867],
      [1.3644, 103.9915],
      [1.2494, 103.6309],
    ]) {
      const grid = toSvy21(lat, lon);
      const back = fromSvy21(grid.northing, grid.easting);
      expect(back.latitude).toBeCloseTo(lat, 8);
      expect(back.longitude).toBeCloseTo(lon, 8);
    }
  });
});

describe('isWithinSvy21Area', () => {
  it('accepts Singapore and rejects elsewhere', () => {
    expect(isWithinSvy21Area(1.35, 103.82)).toBe(true);
    expect(isWithinSvy21Area(51.5, -0.12)).toBe(false);
  });
});
