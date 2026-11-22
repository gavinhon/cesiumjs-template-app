import type * as Cesium from 'cesium';
import { createArcGisFeatureDataSource } from './createArcGisFeatureDataSource';
import { createWfsDataSource } from './createWfsDataSource';
import { loadVectorDataSource } from './loadVectorDataSource';
import type { VectorServiceConfig } from './mapServiceTypes';

/**
 * Turns one of our vector layer configs into a loaded Cesium data source —
 * the vector counterpart of `createImageryProvider`. Every source ends up
 * as GeoJSON; they differ only in how it's requested.
 */
export function createVectorDataSource(
  config: VectorServiceConfig,
): Promise<Cesium.GeoJsonDataSource> {
  switch (config.type) {
    case 'wfs':
      return createWfsDataSource(config);
    case 'arcgis-feature':
      return createArcGisFeatureDataSource(config);
    case 'geojson':
      return loadVectorDataSource(config.url, config.name);
    default: {
      const exhaustive: never = config;
      throw new Error(`Unsupported vector layer: ${JSON.stringify(exhaustive)}`);
    }
  }
}
