import type * as Cesium from 'cesium';
import { loadVectorDataSource } from './loadVectorDataSource';
import type { WfsLayerConfig } from './mapServiceTypes';

export function buildGetFeatureUrl(config: WfsLayerConfig): string {
  const url = new URL(config.url);
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', config.version);
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('outputFormat', 'application/json');
  url.searchParams.set('srsName', 'EPSG:4326');

  if (config.version === '2.0.0') {
    url.searchParams.set('typeNames', config.typeName);
    url.searchParams.set('count', String(config.maxFeatures));
  } else {
    url.searchParams.set('typeName', config.typeName);
    url.searchParams.set('maxFeatures', String(config.maxFeatures));
  }

  return url.toString();
}

export async function createWfsDataSource(
  config: WfsLayerConfig,
): Promise<Cesium.GeoJsonDataSource> {
  const dataSource = await loadVectorDataSource(buildGetFeatureUrl(config), config.name);

  if (dataSource.entities.values.length === 0) {
    throw new Error(
      'The server returned no features. It may not support outputFormat=application/json, ' +
        'or the feature type may be empty.',
    );
  }
  return dataSource;
}
