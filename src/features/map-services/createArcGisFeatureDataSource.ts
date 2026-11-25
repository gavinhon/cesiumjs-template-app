import type * as Cesium from 'cesium';
import { buildFeatureQueryUrl } from './arcGisRest';
import { fetchArcGisJson } from './fetchArcGisJson';
import { loadVectorDataSource } from './loadVectorDataSource';
import type { ArcGisFeatureLayerConfig } from './mapServiceTypes';

export async function createArcGisFeatureDataSource(
  config: ArcGisFeatureLayerConfig,
): Promise<Cesium.GeoJsonDataSource> {
  const geoJson = await fetchArcGisJson(
    buildFeatureQueryUrl(config.url, config.maxFeatures, config.token),
  );
  const dataSource = await loadVectorDataSource(geoJson, config.name);

  if (dataSource.entities.values.length === 0) {
    throw new Error('The layer returned no features.');
  }
  return dataSource;
}
