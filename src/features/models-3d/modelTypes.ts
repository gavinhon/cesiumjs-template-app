export type ModelFormat = '3d-tiles' | 'i3s';

export interface ModelConfig {
  id: string;
  name: string;
  format: ModelFormat;
  url: string;
  placement?: ModelPlacement;
}

export type ModelPlacement = 'on-terrain' | 'draped' | 'as-authored';
