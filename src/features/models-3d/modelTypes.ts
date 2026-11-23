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
export type ModelFormat = '3d-tiles' | 'i3s';

/** A 3D dataset (buildings, point clouds, photogrammetry, ...) the user has connected to. */
export interface ModelConfig {
  /** Locally-generated unique id, used as the React list key. */
  id: string;
  /** User-facing label shown in the panel's list. */
  name: string;
  format: ModelFormat;
  /**
   * For 3D Tiles, the URL of the dataset's `tileset.json`. For I3S, a scene
   * layer (`…/SceneServer/layers/0`) or a whole scene service
   * (`…/SceneServer`), which loads every layer in it.
   */
  url: string;
  /**
   * How it should stand, when the data doesn't say and the app can't tell:
   * a catalogue entry sets `'draped'` for a city layer built on flat ground
   * (HDB LoD2). Unset, the placement is chosen as `useModels` describes.
   */
  placement?: ModelPlacement;
}

/**
 * Where a model sits vertically:
 *
 *  - `on-terrain` — moved up or down as one piece so it stands on the
 *    terrain: a building, a site (`placeTilesetOnTerrain.ts`).
 *  - `draped` — each vertex lifted by the ground beneath it, for a city
 *    layer too large to move as one piece and built on flat ground
 *    (`terrainDrape.ts`). The layer list shows both as "On terrain".
 *  - `as-authored` — left at the heights it came with: underground
 *    models, and anything already georeferenced to the ground you want.
 */
export type ModelPlacement = 'on-terrain' | 'draped' | 'as-authored';
