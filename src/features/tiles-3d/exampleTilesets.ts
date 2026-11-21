import type { TilesetConfig } from './tilesetTypes';

/**
 * Free public 3D datasets covering Singapore that fill in the add form with
 * one pick — one group per format, so the picker says which is which.
 *
 * Each answers without a key and sends CORS headers. They're other
 * people's services and can move or close; replace them with your own when
 * you fork. The I3S scenes were found through ArcGIS Online's public
 * catalogue search (`https://www.arcgis.com/sharing/rest/search?q=singapore
 * type:"Scene Service"`); public, keyless 3D Tiles of Singapore are rare —
 * the ones that exist mostly sit behind Cesium ion or Google keys.
 */
export interface ExampleTileset extends Omit<TilesetConfig, 'id'> {
  /** Picker heading this example is listed under. */
  group: string;
}

const I3S = 'I3S scene layer (ArcGIS SceneServer)';
const TILES = '3D Tiles (tileset.json)';

export const EXAMPLE_TILESETS: readonly ExampleTileset[] = [
  {
    // HDB blocks island-wide, modelled with roof shapes (LoD2).
    group: I3S,
    format: 'i3s',
    name: 'HDB buildings (LoD2)',
    url: 'https://tiles.arcgis.com/tiles/GrCObcYo81O3Ymu8/arcgis/rest/services/hdblod2/SceneServer/layers/0',
  },
  {
    group: I3S,
    format: 'i3s',
    name: 'Singapore building shells (Esri)',
    url: 'https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/Singapore/SceneServer/layers/0',
  },
  {
    // A single development, as plain white blocks (LoD1).
    group: I3S,
    format: 'i3s',
    name: 'Commonwealth Towers (LoD1)',
    url: 'https://tiles.arcgis.com/tiles/GrCObcYo81O3Ymu8/arcgis/rest/services/CommonWealthTowers_wgs84_lod1_notexture/SceneServer/layers/0',
  },
  {
    // Every building on Earth, from OpenStreetMap and Overture Maps (ODbL),
    // already standing on EGM2008-converted terrain — the same convention
    // as this app's DTM. Too big to move or fly to as one model, so it loads
    // where it's authored and the camera stays over Singapore.
    group: TILES,
    format: '3d-tiles',
    name: 'Re:Earth Buildings (worldwide, OSM)',
    url: 'https://buildings.reearth.land/tileset.json',
  },
];
