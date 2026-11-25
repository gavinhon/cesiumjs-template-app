import { APP_CONFIG } from '@/lib/appConfig';
import type { MapServiceType } from './mapServiceTypes';

export interface ExampleMapService {
  id: string;
  type: Extract<MapServiceType, 'arcgis-map' | 'arcgis-feature'>;
  name: string;
  url: string;
  maxFeatures?: number;
}

const EXAMPLE_MAP_SERVICES_ONLINE: readonly ExampleMapService[] = [
  {
    id: 'sg-1839-map',
    type: 'arcgis-map',
    name: 'Map of Singapore, 1839',
    url: 'https://tiles.arcgis.com/tiles/Ue34o2qxc9h430hV/arcgis/rest/services/1839_Map_of_Singapore_and_its_Environs/MapServer',
  },
  {
    id: 'sg-population-density',
    type: 'arcgis-map',
    name: 'Population density',
    url: 'https://tiles.arcgis.com/tiles/nGt4QxSblgDfeJn9/arcgis/rest/services/Singapore_Population_Density_6class/MapServer',
  },
  {
    id: 'sg-tourist-attractions',
    type: 'arcgis-feature',
    name: 'Tourist attractions',
    url: 'https://services2.arcgis.com/j80Jz20at6Bi0thr/arcgis/rest/services/Tourist_Attractions/FeatureServer/0',
  },
  {
    id: 'sg-rail-lines',
    type: 'arcgis-feature',
    name: 'Rail lines',
    url: 'https://services2.arcgis.com/j80Jz20at6Bi0thr/arcgis/rest/services/Rail_Lines/FeatureServer/0',
    maxFeatures: 2000,
  },
  {
    id: 'sg-rail-stations',
    type: 'arcgis-feature',
    name: 'Rail stations',
    url: 'https://services2.arcgis.com/j80Jz20at6Bi0thr/arcgis/rest/services/Rail_Stations/FeatureServer/0',
  },
  {
    id: 'sg-parks',
    type: 'arcgis-feature',
    name: 'Parks & green spaces',
    url: 'https://services5.arcgis.com/XqaKEQIgV03geG0E/arcgis/rest/services/Parks___Green_Spaces/FeatureServer/6',
  },
];

export const EXAMPLE_MAP_SERVICES: readonly ExampleMapService[] = APP_CONFIG.offline
  ? []
  : EXAMPLE_MAP_SERVICES_ONLINE;
