import { CATALOGUE_GROUPS } from '@/lib/catalogueGroups';
import { datasetLocation, publicDatasetsOfKind } from '@/lib/publicDatasets';
import type { QuickAddItem } from '@/ui/QuickAddList';
import { EXAMPLE_MAP_SERVICES } from './exampleMapServices';
import type { MapServiceConfig } from './mapServiceTypes';

export const MAP_SERVICE_QUICK_ADD: readonly { item: QuickAddItem; config: MapServiceConfig }[] = [
  ...publicDatasetsOfKind('xyz').map((dataset) => ({
    item: {
      id: dataset.id,
      name: dataset.name,
      badge: 'XYZ',
      source: datasetLocation(dataset),
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
      source: datasetLocation(dataset),
      group: CATALOGUE_GROUPS.features,
    },
    config: { type: 'geojson' as const, id: dataset.id, name: dataset.name, url: dataset.url },
  })),
  ...EXAMPLE_MAP_SERVICES.map((example) => {
    const id = `example:${example.id}`;
    const item: QuickAddItem = {
      id,
      name: example.name,
      badge: example.type === 'arcgis-feature' ? 'ARCGIS FEATURE' : 'ARCGIS MAP',
      source: example.url.replace(/^https?:\/\//, ''),
      group:
        example.type === 'arcgis-feature' ? CATALOGUE_GROUPS.features : CATALOGUE_GROUPS.imagery,
    };
    const config: MapServiceConfig =
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
