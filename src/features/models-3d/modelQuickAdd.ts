import { CATALOGUE_GROUPS } from '@/lib/catalogueGroups';
import { datasetLocation, publicDatasetsOfKind } from '@/lib/publicDatasets';
import type { QuickAddItem } from '@/ui/QuickAddList';
import { EXAMPLE_MODELS } from './exampleModels';
import type { ModelConfig } from './modelTypes';

const FORMAT_BADGE = { '3d-tiles': '3D TILES', i3s: 'I3S' } as const;

export const MODEL_QUICK_ADD: readonly { item: QuickAddItem; config: ModelConfig }[] = [
  ...publicDatasetsOfKind('3d-tiles').map((dataset) => ({
    item: {
      id: dataset.id,
      name: dataset.name,
      badge: FORMAT_BADGE['3d-tiles'],
      source: datasetLocation(dataset),
      group: CATALOGUE_GROUPS.models,
    },
    config: { id: dataset.id, name: dataset.name, format: '3d-tiles' as const, url: dataset.url },
  })),
  ...EXAMPLE_MODELS.map((example) => {
    const id = `example:${example.url}`;
    return {
      item: {
        id,
        name: example.name,
        badge: FORMAT_BADGE[example.format],
        source: example.url.replace(/^https?:\/\//, ''),
        group: CATALOGUE_GROUPS.models,
      },
      config: { ...example, id },
    };
  }),
];
