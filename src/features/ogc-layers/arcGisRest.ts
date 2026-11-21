import type { GeographicBoundingBox, ServiceLayerOption } from './ogcLayerTypes';

/**
 * Pure helpers for ArcGIS REST: reading service URLs, building request
 * URLs, and parsing the JSON that comes back. The fetching lives in
 * `fetchArcGisJson`, so all of this is testable without a server.
 *
 * Every ArcGIS REST URL has the same shape:
 *
 *     https://host/arcgis/rest/services/<folder>/<name>/<MapServer|FeatureServer>[/<layerId>]
 *
 * The service URL describes the whole service; appending a numeric id
 * addresses one of its layers. Adding `?f=json` to either returns its
 * description as JSON — the ArcGIS equivalent of GetCapabilities.
 */

export type ArcGisServiceType = 'MapServer' | 'FeatureServer';

export interface ArcGisUrl {
  /** The service, without a layer id, query string or trailing slash. */
  serviceUrl: string;
  serviceType: ArcGisServiceType;
  /** Set when the URL addressed one layer of the service. */
  layerId?: number;
}

const SERVICE_PATH = /^(.*\/(MapServer|FeatureServer))(?:\/(\d+))?\/?$/i;

/**
 * Splits an ArcGIS REST URL into service and layer, or returns undefined if
 * it isn't one. A query string is dropped — people paste URLs straight from
 * the service directory, which often end in `?f=pjson`.
 */
export function parseArcGisUrl(url: string): ArcGisUrl | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return undefined;
  }
  const match = SERVICE_PATH.exec(parsed.pathname);
  if (!match) return undefined;
  // ArcGIS is case-insensitive here, but its own spelling reads best.
  const serviceType: ArcGisServiceType =
    match[2].toLowerCase() === 'mapserver' ? 'MapServer' : 'FeatureServer';
  const path = match[1].slice(0, -match[2].length) + serviceType;
  return {
    serviceUrl: parsed.origin + path,
    serviceType,
    ...(match[3] !== undefined && { layerId: Number(match[3]) }),
  };
}

/**
 * The MapServer to draw as imagery. Throws, with what to type instead, for
 * anything else: Cesium reads any URL you give it as a MapServer, so a
 * FeatureServer here would fail one tile at a time instead of once.
 */
export function mapServiceUrl(url: string): string {
  const parsed = parseArcGisUrl(url);
  if (!parsed || parsed.serviceType !== 'MapServer') {
    throw new Error('Expected an ArcGIS MapServer URL, ending in /MapServer.');
  }
  if (parsed.layerId !== undefined) {
    throw new Error(
      'That URL is one layer of the service. Use the service URL, ending in /MapServer — ' +
        'or add the layer as vector data with the FeatureServer / layer type.',
    );
  }
  return parsed.serviceUrl;
}

/**
 * The URL of one feature layer: the URL as given if it already ends in a
 * layer id, otherwise the service URL plus `layerId`.
 */
export function featureLayerUrl(url: string, layerId: string): string {
  const parsed = parseArcGisUrl(url);
  if (!parsed) {
    throw new Error('Expected an ArcGIS FeatureServer or MapServer URL.');
  }
  if (parsed.layerId !== undefined) return `${parsed.serviceUrl}/${parsed.layerId}`;
  if (!/^\d+$/.test(layerId.trim())) {
    throw new Error('Pick a layer, or give its numeric id.');
  }
  return `${parsed.serviceUrl}/${layerId.trim()}`;
}

/** True when the URL already names a layer, so the form needn't ask for one. */
export function urlNamesLayer(url: string): boolean {
  return parseArcGisUrl(url)?.layerId !== undefined;
}

function withQuery(base: string, params: Record<string, string | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

/** The request for a service's (or layer's) own description. */
export function describeUrl(url: string, token?: string): string {
  return withQuery(url, { f: 'json', token });
}

/**
 * The `query` request for a layer's features, as GeoJSON.
 *
 *  - `where=1=1` is ArcGIS for "every feature" — `where` is required.
 *  - `outSR=4326` asks for lon/lat degrees. Without it the server answers
 *    in the layer's own projection (often Web Mercator metres), which
 *    GeoJSON readers take as degrees — the same trap as WFS's `srsName`.
 *  - `f=geojson` needs ArcGIS Server 10.4 or later. Older servers only
 *    speak Esri's own JSON and answer with an error.
 *  - `resultRecordCount` is the cap. The server's `maxRecordCount` applies
 *    as well; when either cuts the result short it sets
 *    `exceededTransferLimit` rather than failing.
 */
export function buildFeatureQueryUrl(
  layerUrl: string,
  maxFeatures: number,
  token?: string,
): string {
  return withQuery(`${layerUrl}/query`, {
    where: '1=1',
    outFields: '*',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: String(maxFeatures),
    token,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The message from an ArcGIS error response, or undefined if it isn't one.
 *
 * ArcGIS reports most failures — a missing token, a bad parameter, a layer
 * that doesn't exist — as `{"error": {...}}` with HTTP **200**, so a
 * successful fetch proves nothing until the body has been checked.
 */
export function readArcGisError(json: unknown): string | undefined {
  if (!isRecord(json) || !isRecord(json.error)) return undefined;
  const { code, message, details } = json.error;
  const detail = Array.isArray(details) ? details.filter((d) => typeof d === 'string') : [];
  const text = [typeof message === 'string' ? message : 'Unknown error', ...detail].join(' ');
  return typeof code === 'number' ? `${text} (ArcGIS error ${code})` : text;
}

/**
 * The layers listed in a service description, for the form's picklist.
 *
 * Group layers are left out: they only gather other layers in a MapServer's
 * table of contents, and have no features of their own to query.
 */
export function parseArcGisServiceLayers(json: unknown): ServiceLayerOption[] {
  if (!isRecord(json) || !Array.isArray(json.layers)) return [];
  return json.layers.flatMap((layer: unknown) => {
    if (!isRecord(layer) || typeof layer.id !== 'number') return [];
    const isGroup = Array.isArray(layer.subLayerIds) && layer.subLayerIds.length > 0;
    if (isGroup) return [];
    const title = typeof layer.name === 'string' ? layer.name : `Layer ${layer.id}`;
    return [{ name: String(layer.id), title }];
  });
}

/** Web Mercator's sphere radius (WGS84 semi-major axis), in metres. */
const MERCATOR_RADIUS = 6378137;

/**
 * A service's `fullExtent` in degrees, or undefined if it's in a projection
 * this can't convert. Only the two that cover nearly every web service are
 * handled: lon/lat (4326) and Web Mercator (3857, which ArcGIS also writes
 * as its pre-EPSG id 102100). A national grid would need a projection
 * library for a zoom target, which isn't worth it.
 */
export function extentToBoundingBox(json: unknown): GeographicBoundingBox | undefined {
  if (!isRecord(json) || !isRecord(json.fullExtent)) return undefined;
  const { xmin, ymin, xmax, ymax, spatialReference } = json.fullExtent;
  if (
    typeof xmin !== 'number' ||
    typeof ymin !== 'number' ||
    typeof xmax !== 'number' ||
    typeof ymax !== 'number' ||
    !isRecord(spatialReference)
  ) {
    return undefined;
  }
  const wkid = spatialReference.latestWkid ?? spatialReference.wkid;

  if (wkid === 4326) return { west: xmin, south: ymin, east: xmax, north: ymax };
  if (wkid === 3857 || wkid === 102100) {
    const toLon = (x: number) => (x / MERCATOR_RADIUS) * (180 / Math.PI);
    const toLat = (y: number) =>
      (2 * Math.atan(Math.exp(y / MERCATOR_RADIUS)) - Math.PI / 2) * (180 / Math.PI);
    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
    return {
      west: clamp(toLon(xmin), 180),
      south: toLat(ymin),
      east: clamp(toLon(xmax), 180),
      north: toLat(ymax),
    };
  }
  return undefined;
}
