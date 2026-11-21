import * as Cesium from 'cesium';
import { createArcGisMapServerProvider } from './createArcGisMapServerProvider';
import type { OgcImageryConfig } from './ogcLayerTypes';

/**
 * Turns one of our raster layer configs into a Cesium `ImageryProvider`.
 *
 * Takes `OgcImageryConfig`, not `OgcLayerConfig`: WFS returns vector
 * features rather than pixels and has no imagery provider to build, so it
 * is excluded from this union by construction rather than by a runtime
 * check. See `createWfsDataSource` for that path.
 *
 * An `ImageryProvider` doesn't fetch anything by itself — it's a strategy
 * object that knows how to *compute a tile URL* for a given (x, y, level).
 * Cesium's imagery layer system calls into it as you pan/zoom to decide
 * what to request. This is the same interface Cesium uses internally for
 * Bing Maps, OpenStreetMap, etc, so any OGC server that speaks WMS/WMTS
 * slots in exactly the same way as a "big name" basemap would.
 *
 * Async because an ArcGIS MapServer has to be asked how it serves its map
 * before a provider can be built; the OGC providers resolve immediately.
 */
export async function createImageryProvider(
  config: OgcImageryConfig,
): Promise<Cesium.ImageryProvider> {
  switch (config.type) {
    case 'wms': {
      const { boundingBox } = config;
      return new Cesium.WebMapServiceImageryProvider({
        url: config.url,
        layers: config.layers,
        parameters: {
          // Ask for a transparent PNG so this layer can sit on top of
          // others instead of covering the whole globe with a solid tile.
          transparent: true,
          format: 'image/png',
        },
        // If we looked this layer up via GetCapabilities, we know exactly
        // where it is — passing it in makes `provider.rectangle` accurate,
        // which is what "zoom to layer" (see useOgcLayers.ts) flies to.
        // Without it, Cesium defaults to a whole-globe rectangle.
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
      // WebMapTileServiceImageryProvider requests pre-rendered tiles from
      // a fixed grid. `tileMatrixSetID` must match one the server actually
      // publishes in its GetCapabilities document (commonly something like
      // "EPSG:3857" or "GoogleMapsCompatible" for a web-mercator grid).
      return new Cesium.WebMapTileServiceImageryProvider({
        url: config.url,
        layer: config.layer,
        style: config.style || 'default',
        format: config.format || 'image/png',
        tileMatrixSetID: config.tileMatrixSetID,
      });

    case 'xyz':
      // UrlTemplateImageryProvider is the generic escape hatch: point it at
      // any URL containing {z}/{x}/{y} (or {s} for a load-balanced
      // subdomain) and it will substitute them per tile. Useful for XYZ/TMS
      // tile servers and WMTS "RESTful" endpoints that hand you a template.
      return new Cesium.UrlTemplateImageryProvider({
        url: config.url,
        ...(config.maximumLevel !== undefined && { maximumLevel: config.maximumLevel }),
      });

    case 'arcgis-map':
      return createArcGisMapServerProvider(config);

    default: {
      // Exhaustiveness check: if a new OgcServiceType is ever added to the
      // union without a case above, TypeScript will flag this line.
      const exhaustive: never = config;
      throw new Error(`Unsupported layer type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
