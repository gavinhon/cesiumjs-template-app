import type * as Cesium from 'cesium';

/**
 * Data model for the OGC services this panel can connect to.
 *
 * OGC (Open Geospatial Consortium) defines several standard protocols that
 * GIS servers (GeoServer, MapServer, ArcGIS Server, QGIS Server, national
 * mapping agencies, ...) expose map data through. They fall into two
 * groups, and the split matters because Cesium consumes them through
 * completely different subsystems:
 *
 * **Raster** — the server hands back pixels, which become an
 * `ImageryLayer` draped over the globe in `viewer.imageryLayers`:
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
 *  - XYZ:                          not a formal OGC standard, but the
 *                                  de-facto format most slippy-map tile
 *                                  servers use, and the easiest way to hand
 *                                  someone a working tile source.
 *
 * **Vector** — the server hands back geometry, which becomes a
 * `GeoJsonDataSource` full of entities in `viewer.dataSources`:
 *
 *  - WFS  (Web Feature Service):  returns the actual features (points,
 *                                  lines, polygons) with their attributes,
 *                                  rather than a picture of them. That means
 *                                  they can be styled and picked client-side,
 *                                  but also that there is no tiling: the
 *                                  server sends every matching feature at
 *                                  once, which is why `maxFeatures` exists.
 *
 * Because of that split, a WFS layer has no opacity slider and no place in
 * the imagery draw order — see `useOgcLayers`.
 */

/** A geographic extent in degrees, the shape `Cesium.Rectangle.fromDegrees` expects. */
export interface GeographicBoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * One layer/feature type discovered by a GetCapabilities lookup.
 *
 * WMS layers and WFS feature types are different concepts on the server,
 * but they present identically here — an identifier, a human-readable
 * title, and maybe an extent — so the form uses one picklist for both.
 */
export interface ServiceLayerOption {
  /** The identifier passed back to the server (WMS `LAYERS` / WFS `typeName`). */
  name: string;
  /** Human-readable title from the capabilities document, for display. */
  title: string;
  /** Where this layer actually is, if the server declared it. */
  boundingBox?: GeographicBoundingBox;
}

export type OgcServiceType = 'wms' | 'wmts' | 'xyz' | 'wfs';

interface BaseConfig {
  /** Locally-generated unique id, used as the React list key. */
  id: string;
  /** User-facing label shown in the layer lists. */
  name: string;
  /** Base URL of the OGC service endpoint. */
  url: string;
}

export interface WmsLayerConfig extends BaseConfig {
  type: 'wms';
  /** Comma-separated WMS layer name(s), e.g. "topp:states" */
  layers: string;
  /**
   * Where this layer actually is, if known from looking up the server's
   * capabilities. Lets the map fly straight to the real location — for a
   * manually-typed layer name this is undefined and "zoom to layer" falls
   * back to a whole-globe view.
   */
  boundingBox?: GeographicBoundingBox;
}

export interface WmtsLayerConfig extends BaseConfig {
  type: 'wmts';
  layer: string;
  style: string;
  format: string;
  tileMatrixSetID: string;
}

export interface XyzLayerConfig extends BaseConfig {
  type: 'xyz';
  /** URL template containing {z}/{x}/{y} placeholders. */
  urlTemplate: string;
  /**
   * The deepest zoom level the source has. Known for a tile pyramid found
   * in `public/`; past it Cesium stretches the deepest tiles instead of
   * requesting ones that would 404.
   */
  maximumLevel?: number;
}

/**
 * WFS changed its parameter names between major versions, so the version
 * isn't cosmetic — it decides which query string we build. See
 * `createWfsDataSource`.
 */
export type WfsVersion = '1.1.0' | '2.0.0';

export interface WfsLayerConfig extends BaseConfig {
  type: 'wfs';
  /** The feature type to request, e.g. "topp:states". */
  typeName: string;
  version: WfsVersion;
  /**
   * Cap on how many features to fetch. WFS has no tiling — without a cap, a
   * large layer will try to send every feature in one response and hang the
   * browser.
   */
  maxFeatures: number;
  boundingBox?: GeographicBoundingBox;
}

/**
 * A static GeoJSON file — not an OGC service, but loaded and drawn exactly
 * like WFS output (WFS is asked for GeoJSON in the first place), so it
 * lives in this feature rather than growing a near-copy of it. The add
 * form doesn't offer it; it comes from the `public/` dataset scan.
 */
export interface GeoJsonFileConfig extends BaseConfig {
  type: 'geojson';
}

/** The configs that produce a `Cesium.ImageryProvider`. */
export type OgcImageryConfig = WmsLayerConfig | WmtsLayerConfig | XyzLayerConfig;

/** The configs that produce a `Cesium.GeoJsonDataSource`. */
export type OgcVectorConfig = WfsLayerConfig | GeoJsonFileConfig;

/** Every config this feature can put on the map. */
export type OgcLayerConfig = OgcImageryConfig | OgcVectorConfig;

/**
 * An imagery layer currently on the globe: display metadata plus the live
 * Cesium object the panel's controls act on.
 *
 * This covers the app's own base map as well as anything the user added,
 * because `useOgcLayers` owns the whole `viewer.imageryLayers` collection —
 * the layer manager can't reorder a stack it only knows half of.
 */
export interface ManagedImageryLayer {
  id: string;
  name: string;
  /** Short badge text for the lists, e.g. "OSM" or "WMS". */
  kind: string;
  /** The live Cesium object this entry controls. */
  cesiumLayer: Cesium.ImageryLayer;
  visible: boolean;
  alpha: number;
  /**
   * False for the app's base map, which `CesiumMap` created and which the
   * OGC panel therefore shouldn't offer to delete.
   */
  removable: boolean;
}

/** A vector layer (WFS or GeoJSON) currently on the globe. */
export interface ManagedVectorLayer {
  id: string;
  name: string;
  /** Short badge text for the lists, e.g. "WFS" or "GEOJSON". */
  kind: string;
  /** The live Cesium object this entry controls. */
  dataSource: Cesium.GeoJsonDataSource;
  visible: boolean;
}
