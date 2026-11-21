/** A 3D Tiles dataset (buildings, point clouds, photogrammetry, ...) the user has connected to. */
export interface TilesetConfig {
  /** Locally-generated unique id, used as the React list key. */
  id: string;
  /** User-facing label shown in the panel's list. */
  name: string;
  /** URL of the dataset's tileset.json. */
  url: string;
}

/**
 * Where a tileset sits vertically: moved so it stands on the terrain, or
 * left at the heights it was authored with — for underground models, and
 * for anything already georeferenced to the ground you want. See
 * `placeTilesetOnTerrain.ts`.
 */
export type TilesetPlacement = 'on-terrain' | 'as-authored';
