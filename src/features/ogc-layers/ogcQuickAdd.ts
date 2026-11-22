import { CATALOGUE_GROUPS } from '@/lib/catalogueGroups';
import { publicDatasetsOfKind } from '@/lib/publicDatasets';
import type { QuickAddItem } from '@/ui/QuickAddList';
import { EXAMPLE_MAP_SERVICES } from './exampleMapServices';
import type { OgcLayerConfig } from './ogcLayerTypes';

/**
 * Every map service and file the Add data catalogue offers in one click,
 * paired with the config that adds it: tile pyramids and GeoJSON files
 * found under `public/` at build time, then the example services. Grouped
 * by what the data is (see CATALOGUE_GROUPS); the row's source line says
 * where it comes from — `public/…` for this app's own files. A constant — both sources are fixed for
 * the life of the page.
 *
 * Its own module, not the panel's, because App also reads it: the search
 * box finds these by name, and a shared link restores them by id.
 *
 * Each is added under the item's own id, which is how the list tells it's
 * already on the map.
 */
export const OGC_QUICK_ADD: readonly { item: QuickAddItem; config: OgcLayerConfig }[] = [
  ...publicDatasetsOfKind('xyz').map((dataset) => ({
    item: {
      id: dataset.id,
      name: dataset.name,
      badge: 'XYZ',
      source: `public/${dataset.path}`,
      group: CATALOGUE_GROUPS.imagery,
    },
    config: {
      type: 'xyz' as const,
      id: dataset.id,
      name: dataset.name,
      url: dataset.urlTemplate,
      maximumLevel: dataset.maximumLevel,
    },
  })),
  ...publicDatasetsOfKind('geojson').map((dataset) => ({
    item: {
      id: dataset.id,
      name: dataset.name,
      badge: 'GEOJSON',
      source: `public/${dataset.path}`,
      group: CATALOGUE_GROUPS.features,
    },
    config: { type: 'geojson' as const, id: dataset.id, name: dataset.name, url: dataset.url },
  })),
  ...EXAMPLE_MAP_SERVICES.map((example) => {
    const id = `example:${example.id}`;
    const item: QuickAddItem = {
      id,
      name: example.name,
      // MapServer draws a picture; FeatureServer sends the features. One
      // "ARCGIS" badge for both hid the difference that matters most.
      badge: example.type === 'arcgis-feature' ? 'ARCGIS FEATURE' : 'ARCGIS MAP',
      source: example.url.replace(/^https?:\/\//, ''),
      group:
        example.type === 'arcgis-feature' ? CATALOGUE_GROUPS.features : CATALOGUE_GROUPS.imagery,
    };
    const config: OgcLayerConfig =
      example.type === 'arcgis-feature'
        ? {
            type: 'arcgis-feature',
            id,
            name: example.name,
            url: example.url,
            maxFeatures: example.maxFeatures ?? 1000,
          }
        : { type: 'arcgis-map', id, name: example.name, url: example.url };
    return { item, config };
  }),
];
