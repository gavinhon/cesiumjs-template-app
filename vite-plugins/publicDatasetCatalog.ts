import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
// Type imports only: Docker runs this file with Node type stripping and no node_modules.
import type { Plugin, ResolvedConfig } from 'vite';
import type {
  PublicDataset,
  PublicTerrainDataset,
  PublicTilePyramidDataset,
} from '../src/lib/publicDatasetTypes.ts';

const VIRTUAL_ID = 'virtual:public-datasets';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

const SKIPPED_FOLDERS = new Set(['cesium', 'node_modules']);

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

interface DatasetBase {
  id: string;
  name: string;
  path: string;
  url: string;
}

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
    return null;
  }
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

function readTilePyramid(folder: string, base: DatasetBase): PublicTilePyramidDataset | null {
  const levels = numberedFolders(folder);
  if (levels.length === 0) return null;

  const firstLevel = path.join(folder, levels[0]);
  const columns = numberedFolders(firstLevel);
  if (columns.length === 0) return null;

  const tile = readdirSync(path.join(firstLevel, columns[0])).find((name) => TILE_IMAGE.test(name));
  if (!tile) return null;

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

function numberedFolders(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && NUMERIC.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(a) - Number(b));
}
