/**
 * What the scan of the datasets folder reports finding — see
 * `vite-plugins/publicDatasetCatalog.ts`, which produces these (over
 * `public/` at build time, or over the mounted data folder when the Docker
 * container starts), and `./publicDatasets.ts`, which hands them to the app.
 *
 * This file is shared by the Vite plugin (running in Node) and the app
 * (running in the browser), so it must stay free of anything either side
 * can't load: no Cesium, no DOM, no Node built-ins. Types only — which
 * also lets the container's copy of the scan run without it, since Node
 * erases `import type`.
 *
 * Each kind maps onto exactly one feature that knows how to put it on the
 * map, which is what lets each panel offer "the datasets I can load" by
 * filtering on `kind`.
 */

interface BaseDataset {
  /** Stable for a given path, so it survives reloads and can key React lists. */
  id: string;
  /** Display name: the dataset's own declared name if it has one, else its folder or file name. */
  name: string;
  /** Location relative to `public/`, shown to the user as a hint. */
  path: string;
}

/** A folder holding a `tileset.json` → a 3D model in the Add data catalogue. */
export interface PublicTilesetDataset extends BaseDataset {
  kind: '3d-tiles';
  /** URL of the `tileset.json`. */
  url: string;
}

/**
 * A folder holding a terrain `layer.json` (as written by
 * `scripts/build_terrain_tiles.py`) → selectable under the map tile.
 */
export interface PublicTerrainDataset extends BaseDataset {
  kind: 'terrain';
  /** URL of the folder holding `layer.json` — what `CesiumTerrainProvider.fromUrl` wants. */
  url: string;
  /** `[west, south, east, north]` in degrees, from `layer.json`, if declared. */
  bounds?: [number, number, number, number];
  /** Credit line from `layer.json`, if declared. */
  attribution?: string;
}

/** A folder laid out as an image tile pyramid, `{z}/{x}/{y}.png` → an XYZ layer in the Add data catalogue. */
export interface PublicTilePyramidDataset extends BaseDataset {
  kind: 'xyz';
  /** URL template with `{z}`, `{x}`, and `{y}` — or `{reverseY}` for a TMS pyramid. */
  urlTemplate: string;
  /** The deepest zoom level present, so Cesium doesn't request tiles that don't exist. */
  maximumLevel: number;
}

/** A `.geojson` file → a vector layer in the Add data catalogue, drawn like WFS. */
export interface PublicGeoJsonDataset extends BaseDataset {
  kind: 'geojson';
  url: string;
}

export type PublicDataset =
  PublicTilesetDataset | PublicTerrainDataset | PublicTilePyramidDataset | PublicGeoJsonDataset;

export type PublicDatasetKind = PublicDataset['kind'];
