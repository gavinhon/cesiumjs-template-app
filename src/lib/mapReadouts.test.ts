import { describe, expect, it } from 'vitest';
import { formatHeight, formatLatLon, formatSvy21, niceScaleBar } from './mapReadouts';

describe('formatLatLon', () => {
  it('writes hemispheres instead of signs', () => {
    expect(formatLatLon(1.2834, 103.8607)).toBe('1.28340° N, 103.86070° E');
    expect(formatLatLon(-33.8568, -151.2153)).toBe('33.85680° S, 151.21530° W');
  });
});

describe('formatSvy21', () => {
  it('puts easting first, to the decimetre', () => {
    expect(formatSvy21(30123.44, 29876.56)).toBe('E 30123.4 N 29876.6');
  });
});

describe('formatHeight', () => {
  it('uses metres up close and kilometres further out', () => {
    expect(formatHeight(12.4)).toBe('12 m');
    expect(formatHeight(999)).toBe('999 m');
    expect(formatHeight(1234)).toBe('1.2 km');
    expect(formatHeight(120_000)).toBe('120 km');
    expect(formatHeight(-8)).toBe('-8 m');
  });
});

describe('niceScaleBar', () => {
  it('picks the longest 1/2/5 distance that fits', () => {
    expect(niceScaleBar(13.7, 100)).toEqual({ widthPx: 1000 / 13.7, label: '1 km' });
    expect(niceScaleBar(2.6, 100)?.label).toBe('200 m');
    expect(niceScaleBar(0.6, 100)?.label).toBe('50 m');
  });

  it('never draws a bar wider than allowed', () => {
    for (const mpp of [0.03, 0.7, 4.2, 55, 900, 12_345]) {
      const bar = niceScaleBar(mpp, 100);
      expect(bar?.widthPx).toBeLessThanOrEqual(100);
      expect(bar?.widthPx).toBeGreaterThan(19);
    }
  });

  it('gives up on a resolution it cannot use', () => {
    expect(niceScaleBar(0, 100)).toBeNull();
    expect(niceScaleBar(Number.NaN, 100)).toBeNull();
    expect(niceScaleBar(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });
});
