import type { LegendContent, LegendItem } from '@/lib/legendTypes';
import { fetchArcGisJson } from './fetchArcGisJson';
import type { OgcImageryConfig } from './ogcLayerTypes';

/**
 * Where an imagery layer's legend comes from, by service type:
 *
 *  - **WMS:** a `GetLegendGraphic` image per layer. Strictly that request
 *    belongs to the SLD extension, not core WMS, but GeoServer, MapServer,
 *    QGIS Server and ArcGIS's WMS all answer it. A server that doesn't
 *    returns an error image or nothing; the legend component hides a
 *    broken image.
 *  - **ArcGIS MapServer:** `/legend?f=json`, which returns every symbol as
 *    a base64 PNG with its label, grouped by sublayer.
 *  - **WMTS and XYZ:** nothing to ask — pre-rendered tiles carry no
 *    legend. (WMTS capabilities *may* declare a LegendURL per style; the
 *    app doesn't keep the capabilities document after adding.)
 *
 * Vector layers aren't here: the app draws them in its own style, so their
 * legend is built from what's loaded (see App's scene entries).
 *
 * Returns a loader rather than a legend so nothing is fetched until the
 * layer manager actually shows it.
 */
export function legendLoaderFor(
  config: OgcImageryConfig,
): (() => Promise<LegendContent | null>) | undefined {
  switch (config.type) {
    case 'wms': {
      const items = config.layers
        .split(',')
        .map((layer) => layer.trim())
        .filter(Boolean)
        .map((layer) => ({ label: layer, imageSrc: wmsLegendUrl(config.url, layer) }));
      return items.length > 0 ? () => Promise.resolve({ kind: 'items', items }) : undefined;
    }
    case 'arcgis-map':
      return async () => {
        const url = withQuery(`${config.url.replace(/\/+$/, '')}/legend`, {
          f: 'json',
          ...(config.token && { token: config.token }),
        });
        const items = parseArcGisLegend(await fetchArcGisJson(url));
        return items.length > 0 ? { kind: 'items', items } : null;
      };
    case 'wmts':
    case 'xyz':
      return undefined;
    default: {
      const unreachable: never = config;
      return unreachable;
    }
  }
}

/**
 * A WMS `GetLegendGraphic` URL for one layer, keeping whatever query the
 * service URL already carries (MapServer's `?map=…`, a vendor key).
 * `SLD_VERSION` is required by WMS 1.3.0 servers that implement it to the
 * letter (MapServer), and ignored by the rest.
 */
export function wmsLegendUrl(serviceUrl: string, layer: string): string {
  return withQuery(serviceUrl, {
    SERVICE: 'WMS',
    REQUEST: 'GetLegendGraphic',
    VERSION: '1.3.0',
    FORMAT: 'image/png',
    SLD_VERSION: '1.1.0',
    LAYER: layer,
  });
}

interface ArcGisLegendResponse {
  layers?: {
    layerName?: string;
    legend?: { label?: string; imageData?: string; contentType?: string }[];
  }[];
}

/**
 * ArcGIS `/legend?f=json` → items. A symbol's label is often empty when a
 * sublayer has one symbol; the sublayer's name stands in for it then.
 */
export function parseArcGisLegend(json: unknown): LegendItem[] {
  const layers = (json as ArcGisLegendResponse | null)?.layers;
  if (!Array.isArray(layers)) return [];
  const grouped = layers.length > 1;
  return layers.flatMap((layer) =>
    (layer.legend ?? []).flatMap((symbol) => {
      if (!symbol.imageData) return [];
      const label = symbol.label?.trim() || layer.layerName || '';
      return [
        {
          label,
          imageSrc: `data:${symbol.contentType ?? 'image/png'};base64,${symbol.imageData}`,
          ...(grouped && layer.layerName && { group: layer.layerName }),
        },
      ];
    }),
  );
}

/** `url` with `params` added, preserving any query it already has. */
function withQuery(url: string, params: Record<string, string>): string {
  const [base, existing = ''] = url.split('?', 2);
  const query = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  return `${base}?${query.toString()}`;
}
