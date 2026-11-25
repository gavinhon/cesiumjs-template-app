import { APP_CONFIG } from '@/lib/appConfig';
import type { ModelConfig } from './modelTypes';

export type ExampleModel = Omit<ModelConfig, 'id'>;

const EXAMPLE_MODELS_ONLINE: readonly ExampleModel[] = [
  {
    format: 'i3s',
    name: 'HDB buildings (LoD2)',
    url: 'https://tiles.arcgis.com/tiles/GrCObcYo81O3Ymu8/arcgis/rest/services/hdblod2/SceneServer/layers/0',
    placement: 'draped',
  },
  {
    format: 'i3s',
    name: 'Singapore building shells (Esri)',
    url: 'https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/Singapore/SceneServer/layers/0',
  },
  {
    format: 'i3s',
    name: 'Commonwealth Towers (LoD1)',
    url: 'https://tiles.arcgis.com/tiles/GrCObcYo81O3Ymu8/arcgis/rest/services/CommonWealthTowers_wgs84_lod1_notexture/SceneServer/layers/0',
  },
  {
    format: '3d-tiles',
    name: 'Re:Earth Buildings (worldwide, OSM)',
    url: 'https://buildings.reearth.land/tileset.json',
  },
  {
    format: 'i3s',
    name: 'OpenStreetMap 3D Buildings (worldwide, Esri)',
    url: 'https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer/layers/0',
  },
];

export const EXAMPLE_MODELS: readonly ExampleModel[] = APP_CONFIG.offline
  ? []
  : EXAMPLE_MODELS_ONLINE;
