/**
 * Data model for the OGC layers the sidebar lets you connect to.
 *
 * OGC (Open Geospatial Consortium) defines several standard protocols that
 * GIS servers (GeoServer, MapServer, ArcGIS Server, QGIS Server, national
 * mapping agencies, ...) expose map data through. The two most common for
 * serving raster imagery are:
 *
 *  - WMS  (Web Map Service):      the server *renders* an image on request
 *                                  for whatever bounding box you ask for.
 *                                  Simple to connect to, but every pan/zoom
 *                                  is a fresh render on the server.
 *  - WMTS (Web Map Tile Service): the server exposes *pre-rendered* tiles
 *                                  on a fixed grid (a "tile matrix set"),
 *                                  the same idea Google/Bing/OSM use. Faster
 *                                  and more cacheable, but you must know the
 *                                  tile matrix set identifier in advance.
 *
 * We also support a plain XYZ/TMS template layer, which isn't a formal OGC
 * standard but is the de-facto format most slippy-map tile servers (and
 * many WMTS servers, via a "RESTful" URL) use, since it's the easiest way
 * to hand someone a working tile source.
 */

export type OgcServiceType = 'wms' | 'wmts' | 'xyz';

interface BaseLayerConfig {
  /** Locally-generated unique id, used as the React list key. */
  id: string;
  /** User-facing label shown in the sidebar layer list. */
  name: string;
  /** Base URL of the OGC service endpoint. */
  url: string;
}

export interface WmsLayerConfig extends BaseLayerConfig {
  type: 'wms';
  /** Comma-separated WMS layer name(s), e.g. "topp:states" */
  layers: string;
  /**
   * Where this layer actually is, if known from looking up the server's
   * capabilities (see src/ogc/wmsCapabilities.ts). Lets the map fly
   * straight to the real location — for a manually-typed layer name, this
   * is undefined and "zoom to layer" falls back to a whole-globe view.
   */
  boundingBox?: { west: number; south: number; east: number; north: number };
}

export interface WmtsLayerConfig extends BaseLayerConfig {
  type: 'wmts';
  layer: string;
  style: string;
  format: string;
  tileMatrixSetID: string;
}

export interface XyzLayerConfig extends BaseLayerConfig {
  type: 'xyz';
  /** URL template containing {z}/{x}/{y} placeholders. */
  urlTemplate: string;
}

export type OgcLayerConfig = WmsLayerConfig | WmtsLayerConfig | XyzLayerConfig;

/** A layer that has been added to the map: its config plus live Cesium state. */
export interface ActiveLayer {
  config: OgcLayerConfig;
  visible: boolean;
  alpha: number;
}
