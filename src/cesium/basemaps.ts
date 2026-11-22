import * as Cesium from 'cesium';
import { APP_CONFIG } from '@/lib/appConfig';
import { PUBLIC_BASEMAPS } from '@/lib/publicDatasets';
import type { PublicTilePyramidDataset } from '@/lib/publicDatasetTypes';
import { tileAt, tileBbox3857 } from '@/lib/slippyTile';
import { INITIAL_VIEW } from './initialView';

/**
 * The base maps the globe can be drawn with — the bottom of the imagery
 * stack, which every other imagery layer is drawn on top of.
 *
 * None needs an API key or a Cesium ion account. Each is a public server run
 * by someone else, used under their terms; their credits are shown on the
 * map, as those terms require.
 *
 * OpenStreetMap comes from OSM's own tile servers rather than a WMS
 * re-rendering of it: the free OSM WMS services (terrestris, for one) stamp
 * a notice over the map once you zoom in to street level. OSM's tile usage
 * policy allows light use like this — a browser app with a visible credit,
 * not bulk downloading. If your app gets heavy traffic, point this at your
 * own tile server or a commercial provider.
 *
 * Purpose-made dark or grey tile services (CARTO, Stadia, MapTiler) all need
 * an account or key now, and OpenStreetMap itself publishes only its one
 * Standard style, so "grey" here is the OSM map drawn without colour.
 *
 * **Offline.** Tile pyramids in the datasets' `basemaps/` folder are added
 * to the list (`localBasemap`). With `APP_CONFIG.offline` set, those are
 * the whole list — the online ones would only draw a blank globe — plus
 * Natural Earth II, the low-resolution world image Cesium ships in its own
 * assets, so there's always *something* under the data.
 */
export interface Basemap {
  id: string;
  /** Shown in the picker and the layer list. */
  name: string;
  /** Short badge for the layer list. */
  kind: string;
  /** A fresh layer each time: an `ImageryLayer` belongs to one collection and is destroyed with it. */
  createLayer: () => Cesium.ImageryLayer;
  /**
   * A preview for the basemap switcher: one real tile of the area the app
   * opens on (`INITIAL_VIEW`), from this basemap's own service, so the
   * picture is what you'll get. `grayscale` mirrors a layer that's drawn
   * desaturated rather than served that way.
   */
  thumbnail: { url: string; grayscale?: boolean };
}

/** The tile the thumbnails show: central Singapore at zoom 11 (~20 km across). */
const THUMB = tileAt(INITIAL_VIEW.longitude, INITIAL_VIEW.latitude, 11);

/** An Esri tile-cache thumbnail — their URLs put y before x. */
function esriThumbnail(service: string): Basemap['thumbnail'] {
  return {
    url: `https://services.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/${THUMB.z}/${THUMB.y}/${THUMB.x}`,
  };
}

const OSM_THUMBNAIL = `https://tile.openstreetmap.org/${THUMB.z}/${THUMB.x}/${THUMB.y}.png`;

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

/** OpenStreetMap's Standard style, straight from openstreetmap.org's tile servers. */
function osmStandard(): Cesium.ImageryLayer {
  return new Cesium.ImageryLayer(
    new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
      // OSM renders zoom 0–19. Without a cap, Cesium keeps asking for deeper
      // tiles as you zoom in; every one of those fails, so the map would
      // stop at 19 anyway, just after a flood of failed requests.
      maximumLevel: 19,
      // Replaces Cesium's built-in OSM credit, which still names MapQuest
      // and the licence OSM dropped in 2012.
      credit: new Cesium.Credit(
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        true,
      ),
    }),
  );
}

/**
 * One of Esri's public basemaps, an ArcGIS MapServer with a Web Mercator
 * tile cache — read with the same `ArcGisMapServerImageryProvider` as an
 * ArcGIS map service added from the Add data panel.
 *
 * These `services.arcgisonline.com` maps answer without a key. Esri asks
 * for "Powered by Esri" plus the data sources on screen; check its terms
 * before using them in a commercial app. The sources are the service's own
 * `copyrightText`, copied here because Cesium would otherwise put it in the
 * attribution pop-up rather than on the map.
 */
function esriLayer(service: string, sources: string): Cesium.ImageryLayer {
  // `fromUrl` is async — it reads the service's tiling scheme first — and
  // `fromProviderAsync` wraps the promise in a layer that can go into the
  // collection now and starts drawing once the provider is ready. That keeps
  // `createLayer` synchronous like the others.
  return Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromUrl(
      `https://services.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer`,
      {
        credit: new Cesium.Credit(
          `Powered by <a href="https://www.esri.com">Esri</a> · ${sources}`,
          true,
        ),
      },
    ),
  );
}

/**
 * A basemap from a tile pyramid in the datasets' `basemaps/` folder — the
 * way to give an air-gapped deployment a real base map. Make one with
 * `gdal2tiles` or QGIS's "Generate XYZ tiles" from imagery you're licensed
 * to copy (docs/deployment-docker.md); it should start at zoom 0, since
 * Cesium asks for the top levels first and shows nothing until they load.
 */
function localBasemap(dataset: PublicTilePyramidDataset): Basemap {
  // The thumbnail tile, or the deepest one that exists for a shallow
  // pyramid. `{reverseY}` is the TMS row order (see the scan), flipped here
  // by hand because this URL goes to an <img>, not through Cesium.
  const tile = tileAt(
    INITIAL_VIEW.longitude,
    INITIAL_VIEW.latitude,
    Math.min(THUMB.z, dataset.maximumLevel),
  );
  const thumbnailUrl = dataset.urlTemplate
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y))
    .replace('{reverseY}', String(2 ** tile.z - 1 - tile.y));

  return {
    id: dataset.id,
    name: dataset.name,
    kind: 'LOCAL XYZ',
    thumbnail: { url: thumbnailUrl },
    createLayer: () =>
      new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url: dataset.urlTemplate,
          maximumLevel: dataset.maximumLevel,
        }),
      ),
  };
}

/**
 * Natural Earth II: a shaded-relief world image at roughly 1 km per pixel,
 * shipped inside Cesium's own static assets (served from `cesium/`, copied
 * there by vite-plugin-cesium), so it needs no network and no files of
 * your own. Too coarse for a city, but it keeps the offline globe from
 * being a featureless ball when no local basemap has been provided.
 */
const NATURAL_EARTH: Basemap = {
  id: 'natural-earth',
  name: 'Natural Earth II (offline)',
  kind: 'TMS',
  // Its deepest level is 2: a geographic (lon/lat) grid of 8 × 4 tiles,
  // rows counted from the south. Column 6, row 2 is the one holding
  // Singapore.
  thumbnail: { url: Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII/2/6/2.jpg') },
  createLayer: () =>
    Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
      ),
    ),
};

const ONLINE_BASEMAPS: readonly Basemap[] = [
  {
    id: 'esri-imagery',
    name: 'Esri World Imagery',
    kind: 'ARCGIS MAP',
    thumbnail: esriThumbnail('World_Imagery'),
    // Sub-metre aerial imagery in cities, far sharper than Sentinel-2.
    createLayer: () =>
      esriLayer(
        'World_Imagery',
        'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
      ),
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    kind: 'XYZ',
    thumbnail: { url: OSM_THUMBNAIL },
    createLayer: osmStandard,
  },
  {
    id: 'osm-grey',
    name: 'OpenStreetMap (grey)',
    kind: 'XYZ',
    thumbnail: { url: OSM_THUMBNAIL, grayscale: true },
    // The same map drawn without colour. `saturation` is applied by Cesium's
    // globe shader as it draws — the images themselves aren't processed —
    // so it costs nothing and needs no second service.
    createLayer: () => {
      const layer = osmStandard();
      layer.saturation = 0;
      return layer;
    },
  },
  {
    id: 'satellite',
    name: 'Satellite (Sentinel-2, 10 m)',
    kind: 'WMS',
    // The same square as the tile thumbnails, asked of the WMS by its extent.
    thumbnail: {
      url:
        'https://tiles.maps.eox.at/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1' +
        `&LAYERS=s2cloudless-2024_3857&SRS=EPSG:3857&BBOX=${tileBbox3857(THUMB).join(',')}` +
        '&WIDTH=128&HEIGHT=128&FORMAT=image/jpeg',
    },
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
  {
    id: 'esri-dark-gray',
    name: 'Esri Dark Gray Canvas',
    kind: 'ARCGIS MAP',
    thumbnail: esriThumbnail('Canvas/World_Dark_Gray_Base'),
    // A purpose-made dark map, without place labels (Esri publishes those
    // as a separate reference layer, which would cover anything you add).
    createLayer: () =>
      esriLayer(
        'Canvas/World_Dark_Gray_Base',
        'Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community',
      ),
  },
];

const LOCAL_BASEMAPS = PUBLIC_BASEMAPS.map(localBasemap);

/**
 * Every basemap on offer. Online: the public services, then any local
 * pyramids. Offline: the local pyramids first, then Natural Earth.
 */
export const BASEMAPS: readonly Basemap[] = APP_CONFIG.offline
  ? [...LOCAL_BASEMAPS, NATURAL_EARTH]
  : [...ONLINE_BASEMAPS, ...LOCAL_BASEMAPS];

/**
 * The basemap the app starts with: the one `app-config.json` names, else
 * the first in the list. Online that's Esri World Imagery — aerial imagery
 * is what the app's 3D content (terrain, buildings, BIM) is easiest to
 * read against; it's keyless like the rest, see `esriLayer` for Esri's
 * terms. Offline it's the first local pyramid, or Natural Earth.
 */
export const DEFAULT_BASEMAP: Basemap =
  BASEMAPS.find((basemap) => basemap.id === APP_CONFIG.defaultBasemap) ?? BASEMAPS[0];
