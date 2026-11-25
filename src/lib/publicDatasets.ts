import bundledDatasets from 'virtual:public-datasets';
import { APP_CONFIG } from './appConfig';
import type {
  PublicDataset,
  PublicDatasetKind,
  PublicTilePyramidDataset,
} from './publicDatasetTypes';

const BASEMAP_FOLDER = 'basemaps/';

const ALL_DATASETS: readonly PublicDataset[] = APP_CONFIG.datasetCatalogue
  ? await fetchDatasetCatalogue(APP_CONFIG.datasetCatalogue)
  : bundledDatasets;

export const PUBLIC_DATASETS: readonly PublicDataset[] = ALL_DATASETS.filter(
  (dataset) => !isBasemap(dataset),
);

export const PUBLIC_BASEMAPS: readonly PublicTilePyramidDataset[] = ALL_DATASETS.filter(isBasemap);

function isBasemap(dataset: PublicDataset): dataset is PublicTilePyramidDataset {
  return dataset.kind === 'xyz' && dataset.path.startsWith(BASEMAP_FOLDER);
}

export function datasetLocation(dataset: PublicDataset): string {
  return `${APP_CONFIG.datasetCatalogue ? 'data' : 'public'}/${dataset.path}`;
}

export function publicDatasetsOfKind<K extends PublicDatasetKind>(
  kind: K,
): Extract<PublicDataset, { kind: K }>[] {
  return PUBLIC_DATASETS.filter(
    (dataset): dataset is Extract<PublicDataset, { kind: K }> => dataset.kind === kind,
  );
}

async function fetchDatasetCatalogue(url: string): Promise<PublicDataset[]> {
  try {
    const response = await fetch(new URL(url, document.baseURI), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const datasets: unknown = await response.json();
    if (!Array.isArray(datasets)) throw new Error('not a JSON array');
    return datasets as PublicDataset[];
  } catch (error) {
    console.error(`Couldn't load the dataset catalogue ${url}:`, error);
    return [];
  }
}
