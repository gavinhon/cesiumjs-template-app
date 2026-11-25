import * as Cesium from 'cesium';
import { describeUrl, extentToBoundingBox, mapServiceUrl } from './arcGisRest';
import { fetchArcGisJson } from './fetchArcGisJson';
import type { ArcGisMapServerConfig } from './mapServiceTypes';

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
