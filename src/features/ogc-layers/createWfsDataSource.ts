import type * as Cesium from 'cesium';
import { loadVectorDataSource } from './loadVectorDataSource';
import type { WfsLayerConfig } from './ogcLayerTypes';

/**
 * Builds the GetFeature URL for a WFS request.
 *
 * The parameter names are version-dependent, and getting them wrong is the
 * single most common reason a WFS request comes back empty or as an
 * exception report:
 *
 *   | concept        | 1.1.0         | 2.0.0       |
 *   | -------------- | ------------- | ----------- |
 *   | which type     | `typeName`    | `typeNames` |
 *   | how many       | `maxFeatures` | `count`     |
 *
 * `outputFormat=application/json` is what makes this usable from Cesium at
 * all: WFS's default output is GML, which Cesium can't read. GeoServer and
 * MapServer both support JSON output, but it is *optional* in the spec — a
 * server that only speaks GML will return an exception report here, which
 * surfaces as a load error in the form.
 */
function buildGetFeatureUrl(config: WfsLayerConfig): string {
  const url = new URL(config.url);
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', config.version);
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('outputFormat', 'application/json');
  // Ask for plain lon/lat degrees. Without this some servers answer in the
  // layer's native projection (metres, in a local grid), which Cesium would
  // then interpret as degrees and scatter the features near (0°, 0°).
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

/**
 * Loads a WFS feature type as a Cesium data source, styled like every other
 * vector layer — see `loadVectorDataSource`.
 */
export async function createWfsDataSource(
  config: WfsLayerConfig,
): Promise<Cesium.GeoJsonDataSource> {
  const dataSource = await loadVectorDataSource(buildGetFeatureUrl(config), config.name);

  // A server that can't do JSON output usually answers with an XML
  // exception report and HTTP 200. Cesium parses that as "valid, but no
  // features", which would silently add an empty layer — better to say so.
  if (dataSource.entities.values.length === 0) {
    throw new Error(
      'The server returned no features. It may not support outputFormat=application/json, ' +
        'or the feature type may be empty.',
    );
  }
  return dataSource;
}
