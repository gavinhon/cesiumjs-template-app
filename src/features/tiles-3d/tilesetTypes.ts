/**
 * The two streaming 3D formats this panel loads. Both are trees of tiles
 * refined as you zoom in; they differ in who defined them and how Cesium
 * reads them:
 *
 *  - **3D Tiles** — the OGC community standard Cesium created, and the
 *    format Cesium renders natively: a `tileset.json` plus its tiles.
 *  - **I3S** (Indexed 3D Scene Layers) — Esri's format, also an OGC
 *    community standard, served by ArcGIS as a `SceneServer`. Cesium's
 *    `I3SDataProvider` translates it into one `Cesium3DTileset` per layer
 *    as it streams, so from there on it renders like 3D Tiles.
 */
export type TilesetFormat = '3d-tiles' | 'i3s';

/** A 3D dataset (buildings, point clouds, photogrammetry, ...) the user has connected to. */
export interface TilesetConfig {
  /** Locally-generated unique id, used as the React list key. */
  id: string;
  /** User-facing label shown in the panel's list. */
  name: string;
  format: TilesetFormat;
  /**
   * For 3D Tiles, the URL of the dataset's `tileset.json`. For I3S, a scene
   * layer (`…/SceneServer/layers/0`) or a whole scene service
   * (`…/SceneServer`), which loads every layer in it.
   */
  url: string;
}

/**
 * Where a tileset sits vertically: moved so it stands on the terrain, or
 * left at the heights it was authored with — for underground models, and
 * for anything already georeferenced to the ground you want. See
 * `placeTilesetOnTerrain.ts`.
 */
export type TilesetPlacement = 'on-terrain' | 'as-authored';
