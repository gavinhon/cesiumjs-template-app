import type * as Cesium from 'cesium';

export interface FeatureAttribute {
  id: string;
  key: string;
  value: string;
}

export type DrawnFeatureKind =
  'point' | 'line' | 'polygon' | 'label' | 'measure' | 'height' | 'line-of-sight';

export type LabelSource = 'none' | 'name' | 'measurement' | (string & {});

export interface DrawnFeature {
  id: string;
  kind: DrawnFeatureKind;
  name: string;
  attributes: FeatureAttribute[];
  labelSource: LabelSource;
  visible: boolean;
  positions: Cesium.Cartesian3[];
  entities: Cesium.Entity[];
  measurement: string | null;
}

export const FIXED_LABEL_SOURCES: { value: LabelSource; label: string }[] = [
  { value: 'none', label: 'No label' },
  { value: 'name', label: 'Name' },
];
