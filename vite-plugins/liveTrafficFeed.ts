// Type imports only: Docker runs this file with Node type stripping and no node_modules.
import type { Plugin } from 'vite';
import type {
  CrowdLevel,
  LiveTrafficFile,
  MrtCrowdLine,
  MrtCrowdSnapshot,
  MrtCrowdStation,
  TrafficCongestionSnapshot,
  TrafficIncident,
  TrafficIncidentSnapshot,
  TrafficLink,
} from '../src/lib/liveTrafficTypes.ts';
import { MRT_STATIONS } from './mrtStations.ts';

const DATAMALL = 'https://datamall2.mytransport.sg/ltaodataservice/';

const PAGE_SIZE = 500;

const CONCURRENT_PAGES = 4;

export const REFRESH_MS = {
  congestion: 5 * 60_000,
  incidents: 2 * 60_000,
  crowd: 10 * 60_000,
} as const;

export const TRAIN_LINES = [
  'CCL',
  'CEL',
  'CGL',
  'DTL',
  'EWL',
  'NEL',
  'NSL',
  'BPL',
  'SLRT',
  'PLRT',
  'TEL',
] as const;

const RETRY_MS = 60_000;

const FORECAST_MS = 60 * 60_000;

export const LIVE_TRAFFIC_URL = 'live/';

type Fetch = typeof fetch;

export async function fetchDataMall(
  endpoint: string,
  accountKey: string,
  fetchImpl: Fetch = fetch,
): Promise<unknown[]> {
  const page = async (skip: number): Promise<unknown[]> => {
    const response = await fetchImpl(`${DATAMALL}${endpoint}?$skip=${skip}`, {
      headers: { AccountKey: accountKey, accept: 'application/json' },
    });
    if (response.status === 401) throw new Error('LTA rejected the AccountKey (HTTP 401).');
    if (!response.ok) throw new Error(`LTA ${endpoint} answered HTTP ${response.status}.`);
    const body = (await response.json()) as { value?: unknown };
    return Array.isArray(body.value) ? body.value : [];
  };

  const records: unknown[] = [];
  for (let first = 0; ; first += CONCURRENT_PAGES) {
    const batch = await Promise.all(
      Array.from({ length: CONCURRENT_PAGES }, (_, i) => page((first + i) * PAGE_SIZE)),
    );
    for (const rows of batch) records.push(...rows);
    if (batch.some((rows) => rows.length < PAGE_SIZE)) return records;
  }
}

async function fetchDataMallOnce(
  endpoint: string,
  accountKey: string,
  fetchImpl: Fetch,
): Promise<unknown[]> {
  const response = await fetchImpl(`${DATAMALL}${endpoint}`, {
    headers: { AccountKey: accountKey, accept: 'application/json' },
  });
  if (response.status === 401) throw new Error('LTA rejected the AccountKey (HTTP 401).');
  if (!response.ok) throw new Error(`LTA ${endpoint} answered HTTP ${response.status}.`);
  const body = (await response.json()) as { value?: unknown };
  return Array.isArray(body.value) ? body.value : [];
}

// Number('') is 0: blanks must read as NaN.
function numberOf(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string' || value.trim() === '') return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function packCongestion(records: unknown[], fetchedAt: string): TrafficCongestionSnapshot {
  const scale = 1e6;
  const roads: string[] = [];
  const roadIndex = new Map<string, number>();
  const links: TrafficLink[] = [];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const r = record as Record<string, unknown>;
    const ends = [r.StartLon, r.StartLat, r.EndLon, r.EndLat].map(numberOf);
    if (ends.some((value) => Number.isNaN(value))) continue;
    const name = typeof r.RoadName === 'string' ? r.RoadName : '';
    let index = roadIndex.get(name);
    if (index === undefined) {
      index = roads.length;
      roads.push(name);
      roadIndex.set(name, index);
    }
    const band = numberOf(r.SpeedBand);
    const category = numberOf(r.RoadCategory);
    links.push([
      Math.round(ends[0] * scale),
      Math.round(ends[1] * scale),
      Math.round(ends[2] * scale),
      Math.round(ends[3] * scale),
      Number.isNaN(band) ? 0 : band,
      Number.isNaN(category) ? 0 : category,
      index,
    ]);
  }
  return { fetchedAt, scale, roads, links };
}

export function packIncidents(records: unknown[], fetchedAt: string): TrafficIncidentSnapshot {
  const incidents: TrafficIncident[] = [];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const r = record as Record<string, unknown>;
    const latitude = numberOf(r.Latitude);
    const longitude = numberOf(r.Longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) continue;
    incidents.push({
      type: typeof r.Type === 'string' ? r.Type : 'Incident',
      message: typeof r.Message === 'string' ? r.Message : '',
      latitude,
      longitude,
    });
  }
  return { fetchedAt, incidents };
}

function crowdLevelOf(value: unknown): CrowdLevel {
  return value === 'l' || value === 'm' || value === 'h' ? value : '';
}

function recordsOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [];
}

export interface LineReadings {
  line: string;
  realtime: unknown[];
  forecast: unknown[];
}

export function packCrowd(
  readings: LineReadings[],
  fetchedAt: string,
  stations: typeof MRT_STATIONS = MRT_STATIONS,
): MrtCrowdSnapshot {
  let windowStart = '';
  let windowEnd = '';
  for (const { realtime } of readings) {
    for (const record of recordsOf(realtime)) {
      if (typeof record.StartTime === 'string') windowStart = record.StartTime;
      if (typeof record.EndTime === 'string') windowEnd = record.EndTime;
    }
  }
  // Some lines' forecasts lag by months; keep only the live reading's day.
  const today = windowStart.slice(0, 10);
  const forecastByCode = new Map<string, Map<string, CrowdLevel>>();
  const times = new Set<string>();
  for (const { forecast } of readings) {
    for (const day of recordsOf(forecast)) {
      for (const station of recordsOf(day.Stations)) {
        if (typeof station.Station !== 'string') continue;
        const levels = forecastByCode.get(station.Station) ?? new Map<string, CrowdLevel>();
        for (const interval of recordsOf(station.Interval)) {
          if (typeof interval.Start !== 'string') continue;
          if (today && !interval.Start.startsWith(today)) continue;
          times.add(interval.Start);
          levels.set(interval.Start, crowdLevelOf(interval.CrowdLevel));
        }
        forecastByCode.set(station.Station, levels);
      }
    }
  }
  const forecastTimes = [...times].sort((a, b) => Date.parse(a) - Date.parse(b));

  const byName = new Map<string, MrtCrowdStation>();
  for (const { line, realtime } of readings) {
    for (const record of recordsOf(realtime)) {
      const code = record.Station;
      if (typeof code !== 'string') continue;
      const place = stations[code];
      if (!place) continue;
      const [name, longitude, latitude] = place;
      const station = byName.get(name) ?? { name, longitude, latitude, lines: [] };
      const levels = forecastByCode.get(code);
      // LTA reports stations not yet in service as 'h' all day.
      if (levels && levels.size > 0 && [...levels.values()].every((level) => level === 'h'))
        continue;
      const entry: MrtCrowdLine = {
        code,
        line,
        now: crowdLevelOf(record.CrowdLevel),
        forecast: forecastTimes.map((time) => levels?.get(time) ?? ''),
      };
      station.lines.push(entry);
      byName.set(name, station);
    }
  }
  return { fetchedAt, windowStart, windowEnd, forecastTimes, stations: [...byName.values()] };
}

function crowdReader(accountKey: string, fetchImpl: Fetch): () => Promise<MrtCrowdSnapshot> {
  const forecasts = new Map<string, { records: unknown[]; day: string; readAt: number }>();
  const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  return async () => {
    const readings: LineReadings[] = [];
    let failure: unknown = null;
    for (const line of TRAIN_LINES) {
      try {
        const realtime = await fetchDataMallOnce(
          `PCDRealTime?TrainLine=${line}`,
          accountKey,
          fetchImpl,
        );
        let forecast = forecasts.get(line);
        if (!forecast || forecast.day !== today() || Date.now() - forecast.readAt > FORECAST_MS) {
          try {
            const records = await fetchDataMallOnce(
              `PCDForecast?TrainLine=${line}`,
              accountKey,
              fetchImpl,
            );
            forecast = { records, day: today(), readAt: Date.now() };
            forecasts.set(line, forecast);
          } catch {
            if (forecast?.day !== today()) forecast = undefined;
          }
        }
        readings.push({ line, realtime, forecast: forecast?.records ?? [] });
      } catch (error) {
        failure = error;
      }
    }
    if (readings.length === 0) throw failure;
    return packCrowd(readings, new Date().toISOString());
  };
}

export function startLiveTrafficFeed(options: {
  accountKey: string;
  publish: (file: LiveTrafficFile, json: string) => void;
  log?: (message: string) => void;
  fetchImpl?: Fetch;
}): () => void {
  const { accountKey, publish, log = console.log, fetchImpl = fetch } = options;
  const feeds: { file: LiveTrafficFile; every: number; read: () => Promise<unknown> }[] = [
    {
      file: 'traffic-congestion.json',
      every: REFRESH_MS.congestion,
      read: async () =>
        packCongestion(
          await fetchDataMall('v4/TrafficSpeedBands', accountKey, fetchImpl),
          new Date().toISOString(),
        ),
    },
    {
      file: 'traffic-incidents.json',
      every: REFRESH_MS.incidents,
      read: async () =>
        packIncidents(
          await fetchDataMall('TrafficIncidents', accountKey, fetchImpl),
          new Date().toISOString(),
        ),
    },
    {
      file: 'mrt-crowd.json',
      every: REFRESH_MS.crowd,
      read: crowdReader(accountKey, fetchImpl),
    },
  ];

  const timers = new Map<LiveTrafficFile, ReturnType<typeof setTimeout>>();
  let stopped = false;
  for (const feed of feeds) {
    const read = async () => {
      let next = feed.every;
      try {
        publish(feed.file, JSON.stringify(await feed.read()));
      } catch (error) {
        next = Math.min(feed.every, RETRY_MS);
        log(`Live traffic: ${feed.file} not updated — ${(error as Error).message}`);
      }
      if (!stopped)
        timers.set(
          feed.file,
          setTimeout(() => void read(), next),
        );
    };
    void read();
  }
  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
  };
}

export function liveTrafficFeed(options: { accountKey?: string }): Plugin {
  const accountKey = options.accountKey?.trim();
  return {
    name: 'live-traffic-feed',
    apply: 'serve',
    configureServer(server) {
      if (!accountKey) return;
      const snapshots = new Map<string, string>();
      const stop = startLiveTrafficFeed({
        accountKey,
        publish: (file, json) => snapshots.set(file, json),
        log: (message) => server.config.logger.warn(message),
      });
      server.httpServer?.once('close', stop);

      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?')[0] ?? '';
        if (url === '/app-config.json') {
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify({ offline: false, liveTraffic: LIVE_TRAFFIC_URL }));
          return;
        }
        if (!url.startsWith(`/${LIVE_TRAFFIC_URL}`)) return next();
        const json = snapshots.get(url.slice(LIVE_TRAFFIC_URL.length + 1));
        response.setHeader('Cache-Control', 'no-store');
        if (!json) {
          response.statusCode = 503;
          response.end('Live traffic not read yet');
          return;
        }
        response.setHeader('Content-Type', 'application/json');
        response.end(json);
      });
    },
  };
}
