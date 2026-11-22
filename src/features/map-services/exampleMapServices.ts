import type { MapServiceType } from './mapServiceTypes';

/**
 * Free, public services that fill in the add form with one pick, so each
 * service type can be tried without first hunting down an endpoint. All of
 * them cover Singapore, where the app starts.
 *
 * Every one answers without a key and sends CORS headers — both checked
 * when they were added, but they're other people's services on ArcGIS
 * Online, found through its public catalogue search
 * (`https://www.arcgis.com/sharing/rest/search?q=singapore …`), and can
 * move or close. Replace them with your own services when you fork.
 */
export interface ExampleMapService {
  id: string;
  type: MapServiceType;
  /** Becomes the display name. */
  name: string;
  url: string;
  /** Feature cap to fill in, for a layer with more features than the default 1,000. */
  maxFeatures?: number;
}

export const EXAMPLE_MAP_SERVICES: readonly ExampleMapService[] = [
  {
    // A scanned 1963 satellite photo, georeferenced — try it at partial
    // opacity over a modern basemap to see the reclaimed coastline.
    id: 'sg-1963-satellite',
    type: 'arcgis-map',
    name: 'Singapore 1963 satellite photo',
    url: 'https://tiles.arcgis.com/tiles/qN3V93cYGMKQCOxL/arcgis/rest/services/Singapore_1963_Satellite_Photo/MapServer',
  },
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
    // ~1,400 segments: over the default cap, within the server's 2,000.
    maxFeatures: 2000,
  },
  {
    id: 'sg-rail-stations',
    type: 'arcgis-feature',
    name: 'Rail stations',
    url: 'https://services2.arcgis.com/j80Jz20at6Bi0thr/arcgis/rest/services/Rail_Stations/FeatureServer/0',
  },
  {
    // Stored in SVY21, Singapore's own grid: the server reprojects it to
    // lon/lat because the query asks for `outSR=4326`.
    id: 'sg-parks',
    type: 'arcgis-feature',
    name: 'Parks & green spaces',
    url: 'https://services5.arcgis.com/XqaKEQIgV03geG0E/arcgis/rest/services/Parks___Green_Spaces/FeatureServer/6',
  },
];
