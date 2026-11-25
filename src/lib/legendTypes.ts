export type LegendContent =
  | { kind: 'items'; items: LegendItem[] }
  | { kind: 'vector'; geometries: VectorGeometry[] }
  | { kind: 'swatches'; items: LegendSwatch[] };

export interface LegendSwatch {
  label: string;
  color: string;
  shape: 'line' | 'point';
}

export interface LegendItem {
  label: string;
  imageSrc: string;
  group?: string;
}

export type VectorGeometry = 'point' | 'line' | 'polygon';
