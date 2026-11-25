import type { Plugin } from 'vite';
import type {
  LiveTrafficFile,
  TrafficCongestionSnapshot,
  TrafficIncident,
  TrafficIncidentSnapshot,
  TrafficLink,
} from '../src/lib/liveTrafficTypes.ts';

/**
 * Reads LTA DataMall's live traffic feeds on a timer and packs them into
 * the two snapshots the map draws (`src/lib/liveTrafficTypes.ts`):
 * congestion (Traffic Speed Bands) and incidents.
 *
 * **Why on a server, never in the browser.** DataMall needs an
 * `AccountKey` on every request, and refuses browsers outright (no CORS;
 * its preflight answers 403). A key in the page would be anyone's key
 * anyway. So something server-side reads the feeds and the app fetches
 * the result from its own origin:
 *
 *  - in `npm run dev`, the `liveTrafficFeed` plugin below, with the key
 *    from `.env` (`LTA_ACCOUNT_KEY`), serving `/live/…` from memory;
 *  - in Docker, `scripts/fetchLiveTraffic.ts`, started by the entrypoint
 *    when `LTA_ACCOUNT_KEY` is set, writing files nginx serves at `/live/`.
 *
 * One reader for everyone also means one set of requests per refresh,
 * however many people have the map open.
 *
 * **Why packed.** Speed bands come 500 records a request; island-wide
 * that's ~144,000 links in ~290 pages, 30 MB of JSON. Packed into tuples
 * of integers it's under 7 MB, and smaller again gzipped.
 *
 * Like `publicDatasetCatalog.ts`, this file must keep to `import type`
 * from anything outside Node's standard library: the container runs it
 * as-is, with Node's type stripping and no node_modules.
 */

const DATAMALL = 'https://datamall2.mytransport.sg/ltaodataservice/';

/** DataMall returns at most this many records per request; `$skip` pages on. */
const PAGE_SIZE = 500;

/** Pages requested at once. DataMall publishes no rate limit; this stays polite. */
const CONCURRENT_PAGES = 4;

/** How often each feed is re-read, matching how often LTA updates it. */
export const REFRESH_MS = {
  congestion: 5 * 60_000,
  incidents: 2 * 60_000,
} as const;

/** Where the snapshots are served, relative to the app's page. */
export const LIVE_TRAFFIC_URL = 'live/';

/** The fetch Node and browsers share, injectable for tests. */
type Fetch = typeof fetch;

/**
 * Every record of a DataMall feed, paging through it a few requests at a
 * time until a page comes back short.
 */
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

/**
 * A number from a field DataMall sends as a number or as a numeric string
 * — `NaN` for anything else, including a blank: `Number('')` is 0, which
 * would put a link with a missing coordinate off the coast of Africa.
 */
function numberOf(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string' || value.trim() === '') return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * LTA's speed-band records as a `TrafficCongestionSnapshot`. Records with
 * unreadable coordinates are dropped rather than drawn at 0°, 0°.
 */
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

/** LTA's incident records as a `TrafficIncidentSnapshot`, dropping any without a position. */
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

/**
 * Keeps both snapshots current: reads each feed now and again at its own
 * interval, handing every successful result to `publish`. A failed read is
 * logged and retried at the next interval; the last good snapshot stands
 * until then, and the map says how old it is. Returns a function that
 * stops the timers.
 */
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
    // One read at a time per feed: a slow read (DataMall having a bad
    // minute) mustn't stack up behind the next interval.
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

/**
 * In `npm run dev`: reads LTA with the key from `.env` and serves the
 * snapshots at `/live/<file>`, plus an `app-config.json` that switches
 * the live traffic layers on (`src/lib/appConfig.ts`). Without a key it
 * does nothing, and the app behaves as it does on GitHub Pages: no live
 * traffic in the catalogue.
 *
 * Dev only (`apply: 'serve'`): a static build has no server to read LTA
 * from. In Docker, `scripts/fetchLiveTraffic.ts` does this job instead.
 */
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
          // Not read yet (the first congestion read takes ~15 s) or the
          // read failed: the app shows "waiting for LTA" and retries.
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
