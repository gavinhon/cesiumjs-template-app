import type { GeographicBoundingBox, ServiceLayerOption } from './mapServiceTypes';

export type ArcGisServiceType = 'MapServer' | 'FeatureServer';

export interface ArcGisUrl {
  serviceUrl: string;
  serviceType: ArcGisServiceType;
  layerId?: number;
}

const SERVICE_PATH = /^(.*\/(MapServer|FeatureServer))(?:\/(\d+))?\/?$/i;

export function parseArcGisUrl(url: string): ArcGisUrl | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return undefined;
  }
  const match = SERVICE_PATH.exec(parsed.pathname);
  if (!match) return undefined;
  const serviceType: ArcGisServiceType =
    match[2].toLowerCase() === 'mapserver' ? 'MapServer' : 'FeatureServer';
  const path = match[1].slice(0, -match[2].length) + serviceType;
  return {
    serviceUrl: parsed.origin + path,
    serviceType,
    ...(match[3] !== undefined && { layerId: Number(match[3]) }),
  };
}

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

export function describeUrl(url: string, token?: string): string {
  return withQuery(url, { f: 'json', token });
}

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

export function readArcGisError(json: unknown): string | undefined {
  if (!isRecord(json) || !isRecord(json.error)) return undefined;
  const { code, message, details } = json.error;
  const detail = Array.isArray(details) ? details.filter((d) => typeof d === 'string') : [];
  const text = [typeof message === 'string' ? message : 'Unknown error', ...detail].join(' ');
  return typeof code === 'number' ? `${text} (ArcGIS error ${code})` : text;
}

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

const MERCATOR_RADIUS = 6378137;

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
