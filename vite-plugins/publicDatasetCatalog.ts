import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import type {
  PublicDataset,
  PublicTerrainDataset,
  PublicTilePyramidDataset,
} from '../src/lib/publicDatasetTypes.ts';

/**
 * Scans `public/` for map datasets and exposes the result to the app as the
 * module `virtual:public-datasets`.
 *
 * **Why at build time, in a plugin.** A browser can't list a folder on a
 * web server — there is no "what files are under /tilesets/?" request in
 * HTTP — so the app can't discover datasets itself. Something that *can*
 * read the disk has to do it ahead of time. Vite is already reading
 * `public/` to serve and copy it, so the scan lives here: it runs when the
 * dev server starts and on every `vite build`, and the result is baked into
 * the bundle as plain data.
 *
 * In dev, adding or removing a dataset while the server is running
 * reloads the page with a fresh scan, so "drop a folder into public/" is
 * the whole workflow.
 *
 * The Docker image can't know its datasets at build time — they're a host
 * folder mounted in later — so its container runs `scanPublicFolder` over
 * that folder at startup instead (`scripts/writeRuntimeConfig.ts`), and
 * `src/lib/publicDatasets.ts` fetches the result. Keep this file free of
 * value imports from `vite` or anything else outside Node's standard
 * library: the container runs it as-is, without node_modules.
 *
 * **What it recognises** — each maps to one feature that can load it:
 *
 *   | found                                  | kind       | loaded by          |
 *   | -------------------------------------- | ---------- | ------------------ |
 *   | a folder with `tileset.json`           | `3d-tiles` | 3D Tiles panel     |
 *   | a folder with a terrain `layer.json`   | `terrain`  | layer manager      |
 *   | a folder shaped like `{z}/{x}/{y}.png` | `xyz`      | OGC panel          |
 *   | a `.geojson` file                      | `geojson`  | OGC panel          |
 *
 * A recognised folder is a leaf: the scan doesn't look inside it, so the
 * thousands of tiles in a terrain or tile pyramid cost one directory read,
 * not thousands.
 *
 * To recognise a new kind of dataset, add a member to `PublicDataset` in
 * `src/lib/publicDatasetTypes.ts` and a check to `classifyFolder` (or the
 * file loop in `scan`) below.
 */

const VIRTUAL_ID = 'virtual:public-datasets';
/** The `\0` prefix is Rollup's convention for "not a real file — don't try to read me". */
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

/**
 * Folders never worth descending into. `cesium` is where Cesium's own
 * runtime assets would land if anything copied them into `public/`.
 */
const SKIPPED_FOLDERS = new Set(['cesium', 'node_modules']);

/** Deep enough for `public/<group>/<dataset>/...`, shallow enough to stay instant. */
const MAX_DEPTH = 6;

const TILE_IMAGE = /^\d+\.(png|jpe?g|webp)$/i;
const NUMERIC = /^\d+$/;

export function publicDatasetCatalog(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'public-dataset-catalog',

    configResolved(resolved) {
      config = resolved;
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : undefined;
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return undefined;
      const datasets = scanPublicFolder(config.publicDir, config.base);
      return `export default ${JSON.stringify(datasets)};`;
    },

    configureServer(server) {
      const publicDir = path.resolve(config.publicDir);
      let pending: ReturnType<typeof setTimeout> | undefined;

      // Generating a terrain pyramid writes thousands of files in a few
      // seconds. Without the debounce that would be thousands of rescans
      // and page reloads; with it, it's one, once the writing stops.
      const rescan = (changedPath: string) => {
        if (!path.resolve(changedPath).startsWith(publicDir)) return;
        clearTimeout(pending);
        pending = setTimeout(() => {
          const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
          if (module) server.moduleGraph.invalidateModule(module);
          server.ws.send({ type: 'full-reload' });
        }, 500);
      };

      server.watcher.on('add', rescan);
      server.watcher.on('unlink', rescan);
      server.watcher.on('addDir', rescan);
      server.watcher.on('unlinkDir', rescan);
    },
  };
}

/** The fields every dataset has, from its location under `public/`. */
interface DatasetBase {
  id: string;
  name: string;
  path: string;
  /** The dataset's own URL, `base`-prefixed — a folder, or a `.geojson` file. */
  url: string;
}

/**
 * Walks `public/` and returns every dataset it recognises, sorted by path.
 *
 * `base` is '/' unless the app is deployed under a sub-path; every URL the
 * app requests has to carry it, or a dataset that works in dev 404s in
 * production. Exported for the tests.
 */
export function scanPublicFolder(publicDir: string, base: string): PublicDataset[] {
  if (!publicDir || !existsSync(publicDir)) return [];
  const datasets: PublicDataset[] = [];

  const baseOf = (entryPath: string, name: string): DatasetBase => {
    const relative = path.relative(publicDir, entryPath).split(path.sep).join('/');
    return {
      id: `public:${relative}`,
      name,
      path: relative,
      url: `${base.replace(/\/$/, '')}/${relative}`,
    };
  };

  function scan(folder: string, depth: number) {
    if (folder !== publicDir) {
      const dataset = classifyFolder(folder, baseOf(folder, path.basename(folder)));
      if (dataset) {
        datasets.push(dataset);
        return;
      }
    }
    if (depth >= MAX_DEPTH) return;

    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = path.join(folder, entry.name);

      if (entry.isDirectory()) {
        if (!SKIPPED_FOLDERS.has(entry.name)) scan(entryPath, depth + 1);
      } else if (entry.name.toLowerCase().endsWith('.geojson')) {
        datasets.push({
          kind: 'geojson',
          ...baseOf(entryPath, entry.name.replace(/\.geojson$/i, '')),
        });
      }
    }
  }

  scan(publicDir, 0);
  return datasets.sort((a, b) => a.path.localeCompare(b.path));
}

/** Decides whether a folder *is* a dataset, rather than a folder that might contain some. */
function classifyFolder(folder: string, base: DatasetBase): PublicDataset | null {
  if (existsSync(path.join(folder, 'tileset.json'))) {
    return { kind: '3d-tiles', ...base, url: `${base.url}/tileset.json` };
  }
  const layerJson = path.join(folder, 'layer.json');
  if (existsSync(layerJson)) return readTerrain(layerJson, base);
  return readTilePyramid(folder, base);
}

function readTerrain(layerJson: string, base: DatasetBase): PublicTerrainDataset | null {
  let layer: Record<string, unknown>;
  try {
    layer = JSON.parse(readFileSync(layerJson, 'utf8')) as Record<string, unknown>;
  } catch {
    // An unreadable layer.json is a broken dataset, not a reason to fail
    // the whole dev server. It just won't be offered.
    return null;
  }
  // Other tools also write files called layer.json; only a terrain one has
  // a terrain format.
  const format = typeof layer.format === 'string' ? layer.format : '';
  if (!format.startsWith('heightmap') && !format.startsWith('quantized-mesh')) return null;

  const bounds =
    Array.isArray(layer.bounds) && layer.bounds.length === 4 ? layer.bounds : undefined;
  return {
    kind: 'terrain',
    ...base,
    name: typeof layer.name === 'string' && layer.name ? layer.name : base.name,
    ...(bounds && { bounds: bounds as [number, number, number, number] }),
    ...(typeof layer.attribution === 'string' &&
      layer.attribution && { attribution: layer.attribution }),
  };
}

/**
 * Recognises `{z}/{x}/{y}.<image>` by looking down one branch of it:
 * numbered folders, holding numbered folders, holding numbered images.
 * Checking one branch rather than all of them is what keeps the scan
 * instant on a pyramid with a hundred thousand tiles.
 */
function readTilePyramid(folder: string, base: DatasetBase): PublicTilePyramidDataset | null {
  const levels = numberedFolders(folder);
  if (levels.length === 0) return null;

  const firstLevel = path.join(folder, levels[0]);
  const columns = numberedFolders(firstLevel);
  if (columns.length === 0) return null;

  const tile = readdirSync(path.join(firstLevel, columns[0])).find((name) => TILE_IMAGE.test(name));
  if (!tile) return null;

  // gdal2tiles and other TMS writers count rows up from the south and
  // leave a tilemapresource.xml behind; XYZ counts down from the north.
  // Cesium's `{reverseY}` placeholder is exactly that flip.
  const isTms = existsSync(path.join(folder, 'tilemapresource.xml'));
  const extension = path.extname(tile);

  const { url, ...rest } = base;
  return {
    kind: 'xyz',
    ...rest,
    urlTemplate: `${url}/{z}/{x}/${isTms ? '{reverseY}' : '{y}'}${extension}`,
    maximumLevel: Math.max(...levels.map(Number)),
  };
}

/**
 * The all-digit subfolder names, in numeric order. Kept as the names on
 * disk, not converted to numbers: "01" would become 1, and opening a
 * folder called "1" fails — which, inside a Vite plugin, takes the whole
 * dev server down with it.
 */
function numberedFolders(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && NUMERIC.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(a) - Number(b));
}
