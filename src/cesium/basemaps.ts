import * as Cesium from 'cesium';

/**
 * The base maps the globe can be drawn with — the bottom of the imagery
 * stack, which every other imagery layer is drawn on top of.
 *
 * All of them are **WMS**, the same OGC standard the OGC panel connects to,
 * and none needs an API key or a Cesium ion account. Each is a public
 * server run by someone else, used under their terms; their credits are
 * shown on the map, as those terms require.
 *
 * Purpose-made dark or grey tile services (CARTO, Stadia, MapTiler) all need
 * an account or key now, and OpenStreetMap itself publishes only its one
 * Standard style, so "grey" here is the OSM map drawn without colour.
 */
export interface Basemap {
  id: string;
  /** Shown in the picker and the layer list. */
  name: string;
  /** Short badge for the layer list. */
  kind: string;
  /** A fresh layer each time: an `ImageryLayer` belongs to one collection and is destroyed with it. */
  createLayer: () => Cesium.ImageryLayer;
}

/**
 * A WMS basemap layer, requested in Web Mercator (EPSG:3857).
 *
 * WMS defaults to plain lat/lon (EPSG:4326), which stretches map labels
 * east–west away from the equator. These maps are styled for Web Mercator,
 * so asking for it keeps text and symbols the shape they were drawn.
 */
function wmsLayer(url: string, layers: string, credit: string): Cesium.ImageryLayer {
  return new Cesium.ImageryLayer(
    new Cesium.WebMapServiceImageryProvider({
      url,
      layers,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      parameters: { format: 'image/png', transparent: false },
      // `true`: shown on the map itself rather than tucked into Cesium's
      // credits pop-up — these providers' terms ask for visible credit.
      credit: new Cesium.Credit(credit, true),
    }),
  );
}

/** OpenStreetMap, rendered as WMS by terrestris — free, with no fees or key. */
function terrestrisOsm(): Cesium.ImageryLayer {
  return wmsLayer(
    'https://ows.terrestris.de/osm/service',
    'OSM-WMS',
    'Map: © <a href="https://www.terrestris.de">terrestris</a>, data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  );
}

export const BASEMAPS: readonly Basemap[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    kind: 'WMS',
    createLayer: terrestrisOsm,
  },
  {
    id: 'osm-grey',
    name: 'OpenStreetMap (grey)',
    kind: 'WMS',
    // The same map drawn without colour. `saturation` is applied by Cesium's
    // globe shader as it draws — the images themselves aren't processed —
    // so it costs nothing and needs no second service.
    createLayer: () => {
      const layer = terrestrisOsm();
      layer.saturation = 0;
      return layer;
    },
  },
  {
    id: 'satellite',
    name: 'Satellite (Sentinel-2, 10 m)',
    kind: 'WMS',
    // EOX's cloud-free Sentinel-2 mosaic. 10 m pixels: clear at city and
    // district scale, soft at street level — there is no sharper satellite
    // imagery available over WMS without a key. EOX licenses the mosaics
    // from 2018 on as CC BY-NC-SA 4.0, i.e. non-commercial use only.
    createLayer: () =>
      wmsLayer(
        'https://tiles.maps.eox.at/wms',
        's2cloudless-2024_3857',
        'Imagery: <a href="https://s2maps.eu">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024)',
      ),
  },
];

/** The basemap the app starts with. */
export const DEFAULT_BASEMAP = BASEMAPS[0];
