import type { LegendContent, LegendItem } from '@/lib/legendTypes';
import { fetchArcGisJson } from './fetchArcGisJson';
import type { ImageryServiceConfig } from './mapServiceTypes';

export function legendLoaderFor(
  config: ImageryServiceConfig,
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

function withQuery(url: string, params: Record<string, string>): string {
  const [base, existing = ''] = url.split('?', 2);
  const query = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  return `${base}?${query.toString()}`;
}
