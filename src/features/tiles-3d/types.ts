/** A 3D Tiles dataset (buildings, point clouds, photogrammetry, ...) the user has connected to. */
export interface TilesetConfig {
  /** Locally-generated unique id, used as the React list key. */
  id: string;
  /** User-facing label shown in the panel's list. */
  name: string;
  /** URL of the dataset's tileset.json. */
  url: string;
}
