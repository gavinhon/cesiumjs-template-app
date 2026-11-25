import { describe, expect, it, vi } from 'vitest';
import { fetchDataMall, packCongestion, packCrowd, packIncidents } from './liveTrafficFeed';

describe('packCongestion', () => {
  it('packs links into integer tuples, naming each road once', () => {
    const snapshot = packCongestion(
      [
        {
          RoadName: 'SERANGOON ROAD',
          RoadCategory: '2',
          SpeedBand: 2,
          StartLon: '103.86246461405193',
          StartLat: '1.3220591510051254',
          EndLon: '103.86315591911669',
          EndLat: '1.3215993547809128',
        },
        {
          RoadName: 'SERANGOON ROAD',
          RoadCategory: '2',
          SpeedBand: 5,
          StartLon: 103.8631,
          StartLat: 1.3216,
          EndLon: 103.864,
          EndLat: 1.321,
        },
      ],
      '2026-11-25T03:20:00.000Z',
    );
    expect(snapshot.roads).toEqual(['SERANGOON ROAD']);
    expect(snapshot.links).toEqual([
      [103862465, 1322059, 103863156, 1321599, 2, 2, 0],
      [103863100, 1321600, 103864000, 1321000, 5, 2, 0],
    ]);
  });

  it('drops links whose coordinates are unreadable', () => {
    const snapshot = packCongestion(
      [{ RoadName: 'X', StartLon: '', StartLat: '1', EndLon: '1', EndLat: '1' }],
      '',
    );
    expect(snapshot.links).toHaveLength(0);
  });
});

describe('packIncidents', () => {
  it('keeps the type, message and position', () => {
    expect(
      packIncidents(
        [
          { Type: 'Accident', Latitude: 1.304, Longitude: 103.919, Message: 'Accident on ECP' },
          { Type: 'Roadwork', Message: 'no position' },
        ],
        't',
      ),
    ).toEqual({
      fetchedAt: 't',
      incidents: [
        { type: 'Accident', message: 'Accident on ECP', latitude: 1.304, longitude: 103.919 },
      ],
    });
  });
});

describe('fetchDataMall', () => {
  const pageOf = (count: number) =>
    new Response(JSON.stringify({ value: Array.from({ length: count }, (_, i) => ({ i })) }));

  it('pages with $skip until a page comes back short', async () => {
    const sizes = [500, 500, 500, 120, 0, 0, 0, 0];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const skip = Number(new URL(String(url)).searchParams.get('$skip'));
      return pageOf(sizes[skip / 500] ?? 0);
    });
    const records = await fetchDataMall('TrafficIncidents', 'key', fetchImpl as typeof fetch);
    expect(records).toHaveLength(1620);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ AccountKey: 'key' });
  });

  it('says so plainly when the key is rejected', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    await expect(
      fetchDataMall('TrafficIncidents', 'bad', fetchImpl as typeof fetch),
    ).rejects.toThrow('LTA rejected the AccountKey');
  });
});

describe('packCrowd', () => {
  const stations = {
    NS1: ['Jurong East', 103.742, 1.333],
    EW24: ['Jurong East', 103.742, 1.333],
    TE10: ['Mount Pleasant', 103.835, 1.326],
  } as const;
  const day = (station: string, levels: string[]) => ({
    Station: station,
    Interval: levels.map((level, i) => ({
      Start: `2026-11-25T0${i}:00:00+08:00`,
      CrowdLevel: level,
    })),
  });
  const now = (station: string, level: string) => ({
    Station: station,
    StartTime: '2026-11-25T19:40:00+08:00',
    EndTime: '2026-11-25T19:50:00+08:00',
    CrowdLevel: level,
  });

  it('joins lines at one station and aligns forecasts to shared times', () => {
    const snapshot = packCrowd(
      [
        {
          line: 'NSL',
          realtime: [now('NS1', 'm')],
          forecast: [{ Stations: [day('NS1', ['l', 'm'])] }],
        },
        {
          line: 'CEL',
          realtime: [],
          forecast: [
            {
              Stations: [
                {
                  Station: 'CE1',
                  Interval: [{ Start: '2026-07-11T00:00:00+08:00', CrowdLevel: 'l' }],
                },
              ],
            },
          ],
        },
        { line: 'EWL', realtime: [now('EW24', 'l'), now('XX9', 'h')], forecast: [] },
      ],
      'fetched',
      stations,
    );
    expect(snapshot.windowStart).toBe('2026-11-25T19:40:00+08:00');
    expect(snapshot.forecastTimes).toHaveLength(2);
    expect(snapshot.stations).toEqual([
      {
        name: 'Jurong East',
        longitude: 103.742,
        latitude: 1.333,
        lines: [
          { code: 'NS1', line: 'NSL', now: 'm', forecast: ['l', 'm'] },
          { code: 'EW24', line: 'EWL', now: 'l', forecast: ['', ''] },
        ],
      },
    ]);
  });

  it('drops stations LTA marks high all day (not in service)', () => {
    const snapshot = packCrowd(
      [
        {
          line: 'TEL',
          realtime: [now('TE10', 'h')],
          forecast: [{ Stations: [day('TE10', ['h', 'h'])] }],
        },
      ],
      'fetched',
      stations,
    );
    expect(snapshot.stations).toEqual([]);
  });

  it('drops unopened stations using a forecast from an earlier day', () => {
    const snapshot = packCrowd(
      [
        {
          line: 'TEL',
          realtime: [now('TE10', 'h')],
          forecast: [
            {
              Stations: [
                {
                  Station: 'TE10',
                  Interval: [{ Start: '2026-07-11T00:00:00+08:00', CrowdLevel: 'h' }],
                },
              ],
            },
          ],
        },
      ],
      'fetched',
      stations,
    );
    expect(snapshot.stations).toEqual([]);
    expect(snapshot.forecastTimes).toEqual([]);
  });
});
