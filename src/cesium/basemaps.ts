import * as Cesium from 'cesium';
import { APP_CONFIG } from '@/lib/appConfig';
import { PUBLIC_BASEMAPS } from '@/lib/publicDatasets';
import type { PublicTilePyramidDataset } from '@/lib/publicDatasetTypes';
import { tileAt, tileBbox3857 } from '@/lib/slippyTile';
import { INITIAL_VIEW } from './initialView';

export interface Basemap {
  id: string;
  name: string;
  kind: string;
  createLayer: () => Cesium.ImageryLayer;
  thumbnail: { url: string; grayscale?: boolean };
}

const THUMB = tileAt(INITIAL_VIEW.longitude, INITIAL_VIEW.latitude, 11);

function esriThumbnail(service: string): Basemap['thumbnail'] {
  return {
    url: `https://services.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/${THUMB.z}/${THUMB.y}/${THUMB.x}`,
  };
}

const OSM_THUMBNAIL = `https://tile.openstreetmap.org/${THUMB.z}/${THUMB.x}/${THUMB.y}.png`;

function wmsLayer(url: string, layers: string, credit: string): Cesium.ImageryLayer {
  return new Cesium.ImageryLayer(
    new Cesium.WebMapServiceImageryProvider({
      url,
      layers,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      parameters: { format: 'image/png', transparent: false },
      credit: new Cesium.Credit(credit, true),
    }),
  );
}

function osmStandard(): Cesium.ImageryLayer {
  return new Cesium.ImageryLayer(
    new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
      maximumLevel: 19,
      credit: new Cesium.Credit(
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        true,
      ),
    }),
  );
}

function esriLayer(service: string, sources: string): Cesium.ImageryLayer {
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

function localBasemap(dataset: PublicTilePyramidDataset): Basemap {
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

const NATURAL_EARTH: Basemap = {
  id: 'natural-earth',
  name: 'Natural Earth II (offline)',
  kind: 'TMS',
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
    thumbnail: {
      url:
        'https://tiles.maps.eox.at/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1' +
        `&LAYERS=s2cloudless-2024_3857&SRS=EPSG:3857&BBOX=${tileBbox3857(THUMB).join(',')}` +
        '&WIDTH=128&HEIGHT=128&FORMAT=image/jpeg',
    },
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
    createLayer: () =>
      esriLayer(
        'Canvas/World_Dark_Gray_Base',
        'Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community',
      ),
  },
];

const LOCAL_BASEMAPS = PUBLIC_BASEMAPS.map(localBasemap);

export const BASEMAPS: readonly Basemap[] = APP_CONFIG.offline
  ? [...LOCAL_BASEMAPS, NATURAL_EARTH]
  : [...ONLINE_BASEMAPS, ...LOCAL_BASEMAPS];

export const DEFAULT_BASEMAP: Basemap =
  BASEMAPS.find((basemap) => basemap.id === APP_CONFIG.defaultBasemap) ?? BASEMAPS[0];
