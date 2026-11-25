import { APP_CONFIG } from '@/lib/appConfig';

export interface PlaceResult {
  id: string;
  title: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
  bbox?: { west: number; south: number; east: number; north: number };
}

interface OneMapResponse {
  results?: { SEARCHVAL?: string; ADDRESS?: string; LATITUDE?: string; LONGITUDE?: string }[];
}

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
  boundingbox?: string[];
}

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

async function searchOneMap(query: string, signal: AbortSignal): Promise<PlaceResult[]> {
  const url =
    'https://www.onemap.gov.sg/api/common/elastic/search' +
    `?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`OneMap search failed (HTTP ${response.status})`);
  return parseOneMapResults(await response.json()).slice(0, 6);
}

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

export interface PlaceService {
  search: (query: string, signal: AbortSignal) => Promise<PlaceResult[]>;
  name: string;
  credit: string;
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

function ownNominatim(url: string): PlaceService {
  const baseUrl = new URL(url.endsWith('/') ? url : `${url}/`, document.baseURI).href;
  return {
    search: (query, signal) => searchNominatim(baseUrl, query, signal),
    name: 'Nominatim',
    credit: '© OpenStreetMap contributors',
    scope: '',
  };
}

export const AS_YOU_TYPE_SERVICE: PlaceService | null = APP_CONFIG.nominatimUrl
  ? ownNominatim(APP_CONFIG.nominatimUrl)
  : APP_CONFIG.offline
    ? null
    : ONEMAP;

export const ON_REQUEST_SERVICE: PlaceService | null =
  APP_CONFIG.nominatimUrl || APP_CONFIG.offline ? null : OSM_NOMINATIM;
