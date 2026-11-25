import { describe, expect, it } from 'vitest';
import { describeAge, ROAD_DETAIL, speedBandLabel } from './trafficPresentation';

describe('speedBandLabel', () => {
  it('reads LTA bands as 10 km/h ranges, the last open-ended', () => {
    expect(speedBandLabel(1)).toBe('0–9 km/h');
    expect(speedBandLabel(3)).toBe('20–29 km/h');
    expect(speedBandLabel(8)).toBe('70 km/h or more');
    expect(speedBandLabel(0)).toBe('No reading');
  });
});

describe('ROAD_DETAIL', () => {
  it('widens from main roads to every road', () => {
    expect([...ROAD_DETAIL.main.categories]).toEqual([1, 2]);
    expect(ROAD_DETAIL.arterial.categories.has(4)).toBe(true);
    expect(ROAD_DETAIL.all.categories.has(5)).toBe(true);
  });
});

describe('describeAge', () => {
  const at = Date.parse('2026-11-25T03:20:00Z');
  it('says how long ago LTA was read', () => {
    expect(describeAge('2026-11-25T03:19:40Z', at)).toEqual({
      text: 'Updated just now',
      stale: false,
    });
    expect(describeAge('2026-11-25T03:16:00Z', at)).toEqual({
      text: 'Updated 4 min ago',
      stale: false,
    });
  });

  it('calls out a snapshot the server has stopped refreshing', () => {
    expect(describeAge('2026-11-25T02:50:00Z', at)).toEqual({
      text: 'Updated 30 min ago',
      stale: true,
    });
    expect(describeAge('2026-11-24T23:20:00Z', at).text).toBe('Updated 4 h ago');
  });
});
