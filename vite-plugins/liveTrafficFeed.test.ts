import { describe, expect, it, vi } from 'vitest';
import { fetchDataMall, packCongestion, packIncidents } from './liveTrafficFeed';

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
