import { describe, expect, it } from 'vitest';
import { toSvy21 } from '@/lib/svy21';
import { parseCoordinateQuery } from './parseCoordinateQuery';

describe('parseCoordinateQuery', () => {
  it('reads latitude-first decimal degrees, as Google Maps copies them', () => {
    expect(parseCoordinateQuery('1.2834, 103.8607')).toEqual({
      latitude: 1.2834,
      longitude: 103.8607,
      system: 'WGS84',
    });
    expect(parseCoordinateQuery('  1.2834 103.8607 ')?.longitude).toBe(103.8607);
  });

  it('reads longitude-first when the first number cannot be a latitude', () => {
    expect(parseCoordinateQuery('103.8607, 1.2834')).toMatchObject({
      latitude: 1.2834,
      longitude: 103.8607,
    });
  });

  it('honours hemisphere letters, in either order and position', () => {
    expect(parseCoordinateQuery('1.2834° N, 103.8607° E')).toMatchObject({
      latitude: 1.2834,
      longitude: 103.8607,
    });
    expect(parseCoordinateQuery('103.8607E 1.2834N')).toMatchObject({
      latitude: 1.2834,
      longitude: 103.8607,
    });
    expect(parseCoordinateQuery('33.8568 S 151.2153 E')).toMatchObject({
      latitude: -33.8568,
      longitude: 151.2153,
    });
    expect(parseCoordinateQuery('51.5 N 0.12 W')).toMatchObject({ longitude: -0.12 });
  });

  it('reads SVY21, labelled or easting-first, back to the same place', () => {
    const { easting, northing } = toSvy21(1.2834, 103.8607);
    for (const text of [
      `E ${easting.toFixed(1)} N ${northing.toFixed(1)}`,
      `N ${northing.toFixed(1)} E ${easting.toFixed(1)}`,
      `${easting.toFixed(1)}, ${northing.toFixed(1)}`,
    ]) {
      const match = parseCoordinateQuery(text);
      expect(match?.system).toBe('SVY21');
      expect(match?.latitude).toBeCloseTo(1.2834, 5);
      expect(match?.longitude).toBeCloseTo(103.8607, 5);
    }
  });

  it('declines things that only look like coordinates', () => {
    expect(parseCoordinateQuery('marina bay')).toBeNull();
    expect(parseCoordinateQuery('1.28')).toBeNull();
    expect(parseCoordinateQuery('95, 200')).toBeNull(); // out of range either way round
    expect(parseCoordinateQuery('900000 900000')).toBeNull(); // SVY21-sized, but not Singapore
    expect(parseCoordinateQuery('1.28 N 103.86 N')).toBeNull();
    expect(parseCoordinateQuery('N 1.28 E 103.86 E')).toBeNull();
  });
});
