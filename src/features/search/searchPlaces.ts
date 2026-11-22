import { APP_CONFIG } from '@/lib/appConfig';

/**
 * Place search ("geocoding") against two keyless services — or a
 * deployment's own Nominatim server instead (see `AS_YOU_TYPE_SERVICE`).
 *
 *  - **OneMap** (Singapore Land Authority): the authoritative gazetteer for
 *    Singapore — every postal code, building and street, with SVY21 and
 *    WGS84 for each. Searched as you type, since the app is focused on
 *    Singapore. Its search endpoint still answers without a key, but its
 *    responses now carry a notice asking clients to register for a token;
 *    if it ever starts refusing, put a token in the request here (see
 *    https://www.onemap.gov.sg/apidocs/).
 *  - **Nominatim** (OpenStreetMap): the whole world. Its usage policy
 *    forbids search-as-you-type and allows at most one request a second,
 *    so it only runs when someone explicitly asks to search worldwide —
 *    never on a keystroke. Results must credit OpenStreetMap, which the
 *    search box does.
 *
 * Fetching and parsing are split so the parsers can be unit-tested
 * against captured responses without a network.
 */

/** A place a search found, in WGS84 degrees. */
export interface PlaceResult {
  id: string;
  title: string;
  /** The full address or description, when it says more than the title. */
  subtitle?: string;
  latitude: number;
  longitude: number;
  /** The place's extent, when the service gives one (a district, a park). */
  bbox?: { west: number; south: number; east: number; north: number };
}

interface OneMapResponse {
  results?: { SEARCHVAL?: string; ADDRESS?: string; LATITUDE?: string; LONGITUDE?: string }[];
}

/** OneMap search JSON → places. Entries without usable coordinates are dropped. */
export function parseOneMapResults(json: unknown): PlaceResult[] {
  const results = (json as OneMapResponse | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry, index) => {
    const latitude = Number(entry.LATITUDE);
    const longitude = Number(entry.LONGITUDE);
    const title = entry.SEARCHVAL?.trim();
    if (!title || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const address = entry.ADDRESS?.trim();
    return [
      {
        id: `onemap:${index}:${latitude},${longitude}`,
        title,
        // OneMap's ADDRESS repeats the search value; it's only worth showing
        // when it adds the street and postal code.
        subtitle: address && address !== title ? address : undefined,
        latitude,
        longitude,
      },
    ];
  });
}

interface NominatimEntry {
  place_id?: number;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  /** [south, north, west, east], as strings. */
  boundingbox?: string[];
}

/** Nominatim `format=jsonv2` → places. */
export function parseNominatimResults(json: unknown): PlaceResult[] {
  if (!Array.isArray(json)) return [];
  return (json as NominatimEntry[]).flatMap((entry) => {
    const latitude = Number(entry.lat);
    const longitude = Number(entry.lon);
    const display = entry.display_name?.trim();
    if (!display || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const title = entry.name?.trim() || display.split(',')[0].trim();
    const [south, north, west, east] = (entry.boundingbox ?? []).map(Number);
    const bbox = [south, north, west, east].every(Number.isFinite)
      ? { west, south, east, north }
      : undefined;
    return [
      {
        id: `osm:${entry.place_id ?? `${latitude},${longitude}`}`,
        title,
        subtitle: display === title ? undefined : display,
        latitude,
        longitude,
        bbox,
      },
    ];
  });
}

/** Singapore places matching `query`, from OneMap. */
async function searchOneMap(query: string, signal: AbortSignal): Promise<PlaceResult[]> {
  const url =
    'https://www.onemap.gov.sg/api/common/elastic/search' +
    `?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`OneMap search failed (HTTP ${response.status})`);
  return parseOneMapResults(await response.json()).slice(0, 6);
}

/**
 * Places matching `query` from a Nominatim server — OpenStreetMap's public
 * one, or a deployment's own. `/search` with `format=jsonv2` is the same
 * API on both (Nominatim 4 and later), so one function serves either.
 */
async function searchNominatim(
  baseUrl: string,
  query: string,
  signal: AbortSignal,
): Promise<PlaceResult[]> {
  const url = new URL('search', baseUrl);
  url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '6' }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Place search failed (HTTP ${response.status})`);
  return parseNominatimResults(await response.json());
}

/** A gazetteer, as the search box uses it. */
export interface PlaceService {
  search: (query: string, signal: AbortSignal) => Promise<PlaceResult[]>;
  /** Shown while it's searching: "Searching OneMap…". */
  name: string;
  /** The credit its terms require, shown over its results. */
  credit: string;
  /** Added to "No places found", for a service that only covers somewhere. */
  scope: string;
}

const ONEMAP: PlaceService = {
  search: searchOneMap,
  name: 'OneMap',
  credit: 'OneMap, Singapore Land Authority',
  scope: ' in Singapore',
};

const OSM_NOMINATIM: PlaceService = {
  search: (query, signal) => searchNominatim('https://nominatim.openstreetmap.org/', query, signal),
  name: 'OpenStreetMap',
  credit: '© OpenStreetMap contributors',
  scope: '',
};

/**
 * A deployment's own Nominatim (`APP_CONFIG.nominatimUrl`). The data is
 * still OpenStreetMap's, so the credit is too — ODbL requires it wherever
 * the server runs.
 */
function ownNominatim(url: string): PlaceService {
  // Resolved against the page, so a relative URL ("nominatim/", the path
  // the Docker image proxies) works wherever the app is served from. The
  // trailing slash matters: without it `new URL('search', …)` would
  // replace the last path segment instead of appending to it.
  const baseUrl = new URL(url.endsWith('/') ? url : `${url}/`, document.baseURI).href;
  return {
    search: (query, signal) => searchNominatim(baseUrl, query, signal),
    name: 'Nominatim',
    credit: '© OpenStreetMap contributors',
    scope: '',
  };
}

/**
 * The gazetteer asked as you type, or null for none.
 *
 * Decided once, here, from the deployment's config:
 *
 *   | config                    | as you type     | on request ("worldwide") |
 *   | ------------------------- | --------------- | ------------------------ |
 *   | default (online)          | OneMap          | OpenStreetMap Nominatim  |
 *   | `nominatimUrl` set        | that Nominatim  | —                        |
 *   | `offline`, no Nominatim   | —               | —                        |
 *
 * A server of your own can be searched as you type, because the usage
 * policy that rules that out is the public server's, not Nominatim's. It
 * replaces OneMap too: it holds whatever extract it was loaded with, and
 * two lists of the same places would be noise. It works offline as well —
 * that's what it's for on an air-gapped network.
 */
export const AS_YOU_TYPE_SERVICE: PlaceService | null = APP_CONFIG.nominatimUrl
  ? ownNominatim(APP_CONFIG.nominatimUrl)
  : APP_CONFIG.offline
    ? null
    : ONEMAP;

/** The gazetteer asked only when someone chooses "Search worldwide", or null for none. */
export const ON_REQUEST_SERVICE: PlaceService | null =
  APP_CONFIG.nominatimUrl || APP_CONFIG.offline ? null : OSM_NOMINATIM;
