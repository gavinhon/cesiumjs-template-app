import * as Cesium from 'cesium';
import { createArcGisMapServerProvider } from './createArcGisMapServerProvider';
import type { ImageryServiceConfig } from './mapServiceTypes';

export async function createImageryProvider(
  config: ImageryServiceConfig,
): Promise<Cesium.ImageryProvider> {
  switch (config.type) {
    case 'wms': {
      const { boundingBox } = config;
      return new Cesium.WebMapServiceImageryProvider({
        url: config.url,
        layers: config.layers,
        parameters: {
          transparent: true,
          format: 'image/png',
        },
        ...(boundingBox && {
          rectangle: Cesium.Rectangle.fromDegrees(
            boundingBox.west,
            boundingBox.south,
            boundingBox.east,
            boundingBox.north,
          ),
        }),
      });
    }

    case 'wmts':
      return new Cesium.WebMapTileServiceImageryProvider({
        url: config.url,
        layer: config.layer,
        style: config.style || 'default',
        format: config.format || 'image/png',
        tileMatrixSetID: config.tileMatrixSetID,
      });

    case 'xyz':
      return new Cesium.UrlTemplateImageryProvider({
        url: config.url,
        ...(config.maximumLevel !== undefined && { maximumLevel: config.maximumLevel }),
      });

    case 'arcgis-map':
      return createArcGisMapServerProvider(config);

    default: {
      const exhaustive: never = config;
      throw new Error(`Unsupported layer type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
