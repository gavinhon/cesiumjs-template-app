import datasets from 'virtual:public-datasets';
import type { PublicDataset, PublicDatasetKind } from './publicDatasetTypes';

/**
 * Every dataset found under `public/` when the app was built (or, in dev,
 * when the page loaded).
 *
 * This is a constant, not state: the list is baked into the bundle by
 * `vite-plugins/publicDatasetCatalog.ts`, because a browser has no way to
 * list a folder on a web server. Adding a dataset means adding files and
 * reloading — in dev the reload happens on its own.
 */
export const PUBLIC_DATASETS: readonly PublicDataset[] = datasets;

/**
 * The datasets of one kind, typed as that kind — so the 3D catalogue
 * gets `PublicTilesetDataset[]` and can read `.url` without narrowing.
 */
export function publicDatasetsOfKind<K extends PublicDatasetKind>(
  kind: K,
): Extract<PublicDataset, { kind: K }>[] {
  return PUBLIC_DATASETS.filter(
    (dataset): dataset is Extract<PublicDataset, { kind: K }> => dataset.kind === kind,
  );
}
