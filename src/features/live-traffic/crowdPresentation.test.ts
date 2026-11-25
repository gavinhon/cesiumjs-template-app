import { describe, expect, it } from 'vitest';
import type { MrtCrowdSnapshot } from '@/lib/liveTrafficTypes';
import {
  busiestAhead,
  busyCount,
  clockTime,
  CROWD_NOW,
  crowdTimeOptions,
  stationLevelAt,
} from './crowdPresentation';

const snapshot: MrtCrowdSnapshot = {
  fetchedAt: '2026-11-25T12:00:00Z',
  windowStart: '2026-11-25T19:40:00+08:00',
  windowEnd: '2026-11-25T19:50:00+08:00',
  forecastTimes: [
    '2026-11-25T19:30:00+08:00',
    '2026-11-25T20:00:00+08:00',
    '2026-11-25T20:30:00+08:00',
  ],
  stations: [
    {
      name: 'Jurong East',
      longitude: 103.742,
      latitude: 1.333,
      lines: [
        { code: 'NS1', line: 'NSL', now: 'l', forecast: ['l', 'l', 'h'] },
        { code: 'EW24', line: 'EWL', now: 'm', forecast: ['l', 'm', 'l'] },
      ],
    },
    {
      name: 'Kent Ridge',
      longitude: 103.784,
      latitude: 1.293,
      lines: [{ code: 'CC24', line: 'CCL', now: 'l', forecast: ['l', 'l', 'l'] }],
    },
  ],
};
const at745pm = Date.parse('2026-11-25T19:45:00+08:00');

describe('crowd presentation', () => {
  it('shows a station at its busiest line', () => {
    const [jurong] = snapshot.stations;
    expect(stationLevelAt(snapshot, jurong, CROWD_NOW)).toBe('m');
    expect(stationLevelAt(snapshot, jurong, snapshot.forecastTimes[2])).toBe('h');
  });

  it('counts moderate and high stations as busy', () => {
    expect(busyCount(snapshot, CROWD_NOW)).toBe(1);
    expect(busyCount(snapshot, snapshot.forecastTimes[0])).toBe(0);
  });

  it('offers now plus the forecast slots still ahead', () => {
    expect(crowdTimeOptions(snapshot, at745pm)).toEqual([
      { value: CROWD_NOW, label: 'Now' },
      { value: snapshot.forecastTimes[1], label: clockTime(snapshot.forecastTimes[1]) },
      { value: snapshot.forecastTimes[2], label: clockTime(snapshot.forecastTimes[2]) },
    ]);
    expect(crowdTimeOptions(null, at745pm)).toEqual([{ value: CROWD_NOW, label: 'Now' }]);
  });

  it('names the busiest slot still ahead', () => {
    expect(busiestAhead(snapshot, snapshot.stations[0], at745pm)).toBe(
      `High at ${clockTime(snapshot.forecastTimes[2])}`,
    );
    expect(busiestAhead(snapshot, snapshot.stations[1], at745pm)).toBe('Low for the rest of today');
  });
});
