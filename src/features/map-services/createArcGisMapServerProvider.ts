import * as Cesium from 'cesium';
import { describeUrl, extentToBoundingBox, mapServiceUrl } from './arcGisRest';
import { fetchArcGisJson } from './fetchArcGisJson';
import type { ArcGisMapServerConfig } from './mapServiceTypes';

/**
 * Creates the imagery provider for an ArcGIS MapServer.
 *
 * Cesium's `ArcGisMapServerImageryProvider.fromUrl` reads the service
 * description itself and picks a strategy from it: a cached service is
 * read as pre-rendered tiles, anything else through the `export` endpoint,
 * which renders an image per tile (like WMS). Only Web Mercator and lon/lat
 * tile caches are supported; a cache in a national grid throws.
 *
 * We read the description once ourselves first, for two reasons:
 *
 *  - **Errors.** ArcGIS reports a missing token or a bad service as HTTP 200
 *    with an error body. Cesium takes that as a valid service with no tile
 *    cache, then requests `export` images that all fail — so the layer is
 *    added, and silently blank. Checking first turns that into a message.
 *  - **Extent.** Cesium only reads `fullExtent` for cached services. For a
 *    dynamic one it reports the whole world, so "zoom to layer" couldn't
 *    find it. Passing the extent as `rectangle` fixes that, and also stops
 *    Cesium asking the server to render tiles where there's nothing.
 */
export async function createArcGisMapServerProvider(
  config: ArcGisMapServerConfig,
): Promise<Cesium.ArcGisMapServerImageryProvider> {
  const serviceUrl = mapServiceUrl(config.url);
  const description = await fetchArcGisJson(describeUrl(serviceUrl, config.token));
  const box = extentToBoundingBox(description);

  return Cesium.ArcGisMapServerImageryProvider.fromUrl(serviceUrl, {
    ...(config.token && { token: config.token }),
    ...(box && {
      rectangle: Cesium.Rectangle.fromDegrees(box.west, box.south, box.east, box.north),
    }),
  });
}
