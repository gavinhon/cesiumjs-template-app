import bundledDatasets from 'virtual:public-datasets';
import { APP_CONFIG } from './appConfig';
import type {
  PublicDataset,
  PublicDatasetKind,
  PublicTilePyramidDataset,
} from './publicDatasetTypes';

/**
 * Tile pyramids under this folder are basemaps, not layers: they're offered
 * in the basemap switcher (`src/cesium/basemaps.ts`) instead of the Add
 * data catalogue. It's how an air-gapped deployment gets a base map at all
 * — every built-in one is someone else's server.
 */
const BASEMAP_FOLDER = 'basemaps/';

/**
 * Every dataset the app knows about: either the scan of `public/` baked in
 * when the app was built (or, in dev, when the page loaded), or — when the
 * deployment says so in `app-config.json` — a catalogue written by the
 * server at startup.
 *
 * **Why two sources.** A browser can't list a folder on a web server, so
 * *something* with disk access has to scan the datasets ahead of time. In
 * dev and on GitHub Pages that's the Vite plugin, at build time
 * (`vite-plugins/publicDatasetCatalog.ts`). In the Docker deployment the
 * datasets are a host folder mounted into the container, unknown when the
 * image was built, so the container runs the same scan when it starts
 * (`scripts/writeRuntimeConfig.ts`) and the app fetches the result here.
 *
 * Still a constant, not state: the top-level `await` resolves before any
 * module that imports this one runs, so the feature modules can go on
 * deriving their catalogues from it at load time. Adding a dataset means
 * adding files and reloading (restarting the container, in Docker).
 */
const ALL_DATASETS: readonly PublicDataset[] = APP_CONFIG.datasetCatalogue
  ? await fetchDatasetCatalogue(APP_CONFIG.datasetCatalogue)
  : bundledDatasets;

/** Every dataset for the panels — all of them except the basemaps. */
export const PUBLIC_DATASETS: readonly PublicDataset[] = ALL_DATASETS.filter(
  (dataset) => !isBasemap(dataset),
);

/** Tile pyramids in the `basemaps/` folder, for the basemap switcher. */
export const PUBLIC_BASEMAPS: readonly PublicTilePyramidDataset[] = ALL_DATASETS.filter(isBasemap);

function isBasemap(dataset: PublicDataset): dataset is PublicTilePyramidDataset {
  return dataset.kind === 'xyz' && dataset.path.startsWith(BASEMAP_FOLDER);
}

/**
 * Where a dataset lives, as a hint for the catalogue: under `public/` in
 * dev, or under the mounted data folder (served as `data/`) in Docker —
 * telling someone to look in `public/` there would send them to the
 * wrong place.
 */
export function datasetLocation(dataset: PublicDataset): string {
  return `${APP_CONFIG.datasetCatalogue ? 'data' : 'public'}/${dataset.path}`;
}

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

/**
 * Loads the runtime catalogue. A failure leaves the app running with no
 * datasets rather than not running at all — the map, drawing and
 * measuring all still work — and says why in the console.
 *
 * Dataset URLs in the catalogue are relative (`data/terrain/...`), and
 * Cesium resolves a relative URL against the *page*, which is where the
 * server mounts them; nothing here needs to rewrite them.
 */
async function fetchDatasetCatalogue(url: string): Promise<PublicDataset[]> {
  try {
    const response = await fetch(new URL(url, document.baseURI), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const datasets: unknown = await response.json();
    if (!Array.isArray(datasets)) throw new Error('not a JSON array');
    // Written by our own scan, so trusted to have the right shape.
    return datasets as PublicDataset[];
  } catch (error) {
    console.error(`Couldn't load the dataset catalogue ${url}:`, error);
    return [];
  }
}
