import type * as Cesium from 'cesium';
import { buildFeatureQueryUrl } from './arcGisRest';
import { fetchArcGisJson } from './fetchArcGisJson';
import { loadVectorDataSource } from './loadVectorDataSource';
import type { ArcGisFeatureLayerConfig } from './ogcLayerTypes';

/**
 * Loads one ArcGIS feature layer as a Cesium data source, styled like every
 * other vector layer — see `loadVectorDataSource`.
 *
 * The GeoJSON is fetched here rather than by Cesium so an ArcGIS error
 * (which arrives as HTTP 200, see `readArcGisError`) is reported as what it
 * is, instead of as "unsupported GeoJSON object".
 */
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
