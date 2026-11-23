import { APP_CONFIG } from '@/lib/appConfig';
import type { ModelConfig } from './modelTypes';

/**
 * Free public 3D datasets covering Singapore that fill in the add form with
 * one pick. Each row's badge says its format (3D Tiles or I3S).
 *
 * Each answers without a key and sends CORS headers. They're other
 * people's services and can move or close; replace them with your own when
 * you fork. The I3S scenes were found through ArcGIS Online's public
 * catalogue search (`https://www.arcgis.com/sharing/rest/search?q=singapore
 * type:"Scene Service"`); public, keyless 3D Tiles of Singapore are rare —
 * the ones that exist mostly sit behind Cesium ion or Google keys.
 */
export type ExampleModel = Omit<ModelConfig, 'id'>;

const EXAMPLE_MODELS_ONLINE: readonly ExampleModel[] = [
  {
    // HDB blocks island-wide, modelled with roof shapes (LoD2).
    format: 'i3s',
    name: 'HDB buildings (LoD2)',
    url: 'https://tiles.arcgis.com/tiles/GrCObcYo81O3Ymu8/arcgis/rest/services/hdblod2/SceneServer/layers/0',
  },
  {
    format: 'i3s',
    name: 'Singapore building shells (Esri)',
    url: 'https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/Singapore/SceneServer/layers/0',
  },
  {
    // A single development, as plain white blocks (LoD1).
    format: 'i3s',
    name: 'Commonwealth Towers (LoD1)',
    url: 'https://tiles.arcgis.com/tiles/GrCObcYo81O3Ymu8/arcgis/rest/services/CommonWealthTowers_wgs84_lod1_notexture/SceneServer/layers/0',
  },
  {
    // Every building on Earth, from OpenStreetMap and Overture Maps (ODbL),
    // already standing on EGM2008-converted terrain — the same convention
    // as this app's DTM. Too big to move or fly to as one model, so it loads
    // where it's authored and the camera stays over Singapore.
    format: '3d-tiles',
    name: 'Re:Earth Buildings (worldwide, OSM)',
    url: 'https://buildings.reearth.land/tileset.json',
  },
  {
    // Esri's worldwide scene layer of OpenStreetMap buildings (and
    // Microsoft footprints where OSM has none), streamed without a key.
    // Roofs are modelled where OSM tags a roof shape — few buildings in
    // Singapore are — so most are blocks at their tagged height or levels.
    // Under Esri's terms of use; its copyright text is credited on screen.
    format: 'i3s',
    name: 'OpenStreetMap 3D Buildings (worldwide, Esri)',
    url: 'https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer/layers/0',
  },
];

/**
 * The examples on offer: none offline (`APP_CONFIG.offline`), since all of
 * them are on the internet; tilesets in the data folder are offered instead.
 */
export const EXAMPLE_MODELS: readonly ExampleModel[] = APP_CONFIG.offline
  ? []
  : EXAMPLE_MODELS_ONLINE;
