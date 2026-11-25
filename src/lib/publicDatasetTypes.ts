interface BaseDataset {
  id: string;
  name: string;
  path: string;
}

export interface PublicTilesetDataset extends BaseDataset {
  kind: '3d-tiles';
  url: string;
}

export interface PublicTerrainDataset extends BaseDataset {
  kind: 'terrain';
  url: string;
  bounds?: [number, number, number, number];
  attribution?: string;
}

export interface PublicTilePyramidDataset extends BaseDataset {
  kind: 'xyz';
  urlTemplate: string;
  maximumLevel: number;
}

export interface PublicGeoJsonDataset extends BaseDataset {
  kind: 'geojson';
  url: string;
}

export type PublicDataset =
  PublicTilesetDataset | PublicTerrainDataset | PublicTilePyramidDataset | PublicGeoJsonDataset;

export type PublicDatasetKind = PublicDataset['kind'];
