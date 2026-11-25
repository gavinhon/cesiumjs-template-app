// Type imports only: Docker runs this file with Node type stripping and no node_modules.
import type { Plugin } from 'vite';
import type {
  LiveTrafficFile,
  TrafficCongestionSnapshot,
  TrafficIncident,
  TrafficIncidentSnapshot,
  TrafficLink,
} from '../src/lib/liveTrafficTypes.ts';

const DATAMALL = 'https://datamall2.mytransport.sg/ltaodataservice/';

const PAGE_SIZE = 500;

const CONCURRENT_PAGES = 4;

export const REFRESH_MS = {
  congestion: 5 * 60_000,
  incidents: 2 * 60_000,
} as const;

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

export function startLiveTrafficFeed(options: {
  accountKey: string;
  publish: (file: LiveTrafficFile, json: string) => void;
  log?: (message: string) => void;
  fetchImpl?: Fetch;
}): () => void {
  const { accountKey, publish, log = console.log, fetchImpl = fetch } = options;
  const feeds = [
    {
      file: 'traffic-congestion.json',
      endpoint: 'v4/TrafficSpeedBands',
      every: REFRESH_MS.congestion,
      pack: packCongestion,
    },
    {
      file: 'traffic-incidents.json',
      endpoint: 'TrafficIncidents',
      every: REFRESH_MS.incidents,
      pack: packIncidents,
    },
  ] as const;

  const timers: ReturnType<typeof setInterval>[] = [];
  for (const feed of feeds) {
    let busy = false;
    const read = async () => {
      if (busy) return;
      busy = true;
      try {
        const records = await fetchDataMall(feed.endpoint, accountKey, fetchImpl);
        const snapshot = feed.pack(records, new Date().toISOString());
        publish(feed.file, JSON.stringify(snapshot));
      } catch (error) {
        log(`Live traffic: ${feed.file} not updated — ${(error as Error).message}`);
      } finally {
        busy = false;
      }
    };
    void read();
    timers.push(setInterval(() => void read(), feed.every));
  }
  return () => timers.forEach(clearInterval);
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
