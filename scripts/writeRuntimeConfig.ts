/**
 * Writes the files the app reads at startup when it runs in Docker:
 *
 *   - `datasets.json`: the dataset catalogue, from scanning the data folder
 *     mounted into the container;
 *   - `app-config.json`: the deployment's settings (`src/lib/appConfig.ts`),
 *     pointing the app at that catalogue;
 *   - `nginx-nominatim.conf`, only with `--nominatim-upstream`: the nginx
 *     location that proxies `nominatim/` to a Nominatim server.
 *
 *     node scripts/writeRuntimeConfig.ts --data /data --data-url data \
 *       --out /run/app --offline true [--default-basemap <id>] \
 *       [--nominatim-upstream http://nominatim:8080]
 *
 * Run by `docker/docker-entrypoint.sh` each time the container starts.
 *
 * **Why at container start.** In dev the scan runs inside Vite at build
 * time (`vite-plugins/publicDatasetCatalog.ts`) and is baked into the
 * bundle. A container image is built once, on a connected machine, and its
 * datasets are a host folder bind-mounted in later — unknown at build
 * time, and changeable without rebuilding. So the same scan runs here, over
 * the mounted folder, and the app fetches the result instead of using the
 * (empty) one baked in. It's the *same* function, imported from the plugin,
 * so the two can't disagree about what counts as a dataset.
 *
 * **Why TypeScript run directly.** Node 23.6+ strips type annotations
 * itself, so the image needs no compiler and no node_modules: this file
 * and the plugin it imports are copied in as they are. That only works for
 * syntax Node can erase without transforming (no enums, no parameter
 * properties) — which `erasableSyntaxOnly` in tsconfig.node.json enforces —
 * and for imports that name the `.ts` file. The plugin's imports of `vite`
 * and of the dataset types are `import type`, which Node drops, so neither
 * needs to exist in the image.
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { scanPublicFolder } from '../vite-plugins/publicDatasetCatalog.ts';

/** Where the app looks for the catalogue, relative to `index.html` — nginx serves it there. */
const CATALOGUE_URL = 'datasets.json';

/** Where the app reaches the proxied Nominatim, relative to `index.html`. */
const NOMINATIM_PATH = 'nominatim/';

interface Upstream {
  /** `http://host:port`. */
  origin: string;
  /** Any path the server sits under, without a trailing slash ('' for none). */
  basePath: string;
}

const { values } = parseArgs({
  options: {
    data: { type: 'string' },
    'data-url': { type: 'string' },
    out: { type: 'string' },
    offline: { type: 'string', default: 'false' },
    'default-basemap': { type: 'string', default: '' },
    'nominatim-upstream': { type: 'string', default: '' },
  },
});

const dataDir = values.data;
const dataUrl = values['data-url'];
const outDir = values.out;
if (!dataDir || !dataUrl || !outDir) {
  console.error(
    'Usage: node writeRuntimeConfig.ts --data <folder> --data-url <url> --out <folder> ' +
      '[--offline true|false] [--default-basemap <id>] [--nominatim-upstream <url>]',
  );
  process.exit(2);
}

const offline = parseBoolean(values.offline);
const nominatim = values['nominatim-upstream'] ? parseUpstream(values['nominatim-upstream']) : null;
// The scan prefixes every dataset URL with `dataUrl` — relative ("data"),
// so the app resolves it against its own page and stays same-origin
// wherever it's served from.
const datasets = scanPublicFolder(dataDir, dataUrl);

writeAtomically(path.join(outDir, CATALOGUE_URL), datasets);
writeAtomically(path.join(outDir, 'app-config.json'), {
  offline,
  datasetCatalogue: CATALOGUE_URL,
  ...(values['default-basemap'] && { defaultBasemap: values['default-basemap'] }),
  ...(nominatim && { nominatimUrl: NOMINATIM_PATH }),
});

// Written or removed on every start, so taking NOMINATIM_URL out of `.env`
// really turns the proxy off rather than leaving the last run's in place.
const nginxSnippet = path.join(outDir, 'nginx-nominatim.conf');
if (nominatim) writeFileSync(nginxSnippet, nominatimLocation(nominatim));
else rmSync(nginxSnippet, { force: true });

const counts = new Map<string, number>();
for (const dataset of datasets) counts.set(dataset.kind, (counts.get(dataset.kind) ?? 0) + 1);
const summary = [...counts].map(([kind, count]) => `${count} ${kind}`).join(', ') || 'none';
console.log(`Datasets in ${dataDir}: ${summary}. Offline mode: ${offline ? 'on' : 'off'}.`);
if (nominatim) {
  console.log(`Place search: Nominatim at ${nominatim.origin}${nominatim.basePath}/`);
}

/**
 * `true`/`false` and the usual spellings of them. Anything else is an
 * error rather than a guess: a typo in `.env` that silently left the app
 * trying to reach the internet would be found the slow way.
 */
function parseBoolean(text: string): boolean {
  const value = text.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off', ''].includes(value)) return false;
  console.error(`--offline must be true or false, not "${text}"`);
  process.exit(2);
}

/**
 * Splits a Nominatim server's URL, as the container reaches it, into the
 * pieces the nginx location needs — and refuses anything but a plain
 * http(s) URL, since it's pasted into nginx's config: a stray quote or
 * semicolon from `.env` would otherwise become nginx syntax.
 */
function parseUpstream(text: string): Upstream {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    console.error(`--nominatim-upstream must be a URL, not "${text}"`);
    process.exit(2);
  }
  if (!/^https?:$/.test(url.protocol) || url.search || url.hash || /["';\s{}$]/.test(url.href)) {
    console.error(`--nominatim-upstream must be a plain http(s) URL, not "${text}"`);
    process.exit(2);
  }
  return { origin: url.origin, basePath: url.pathname.replace(/\/+$/, '') };
}

/**
 * The nginx location that forwards `/nominatim/<anything>` to the server.
 *
 * **Why proxy at all**, rather than have the browser call Nominatim
 * directly: every request the app makes stays on one origin, so there's
 * no CORS to configure and the browser never needs to resolve or reach the
 * Nominatim host — only the container does, which on a locked-down
 * network is often the only thing that can.
 *
 * **Why `resolver` and a variable.** `proxy_pass http://nominatim:8080`
 * written literally makes nginx resolve the host once, at startup — and
 * refuse to start at all if the Nominatim container isn't up yet. Held in
 * a variable, it's resolved per request through Docker's embedded DNS
 * (127.0.0.11, present on every Compose network), so the containers can
 * start in either order. A variable in `proxy_pass` also stops nginx
 * mapping the path for us, hence the explicit `rewrite`.
 */
function nominatimLocation({ origin, basePath }: Upstream): string {
  return `# Written by writeRuntimeConfig.ts at container start. Don't edit.
location /${NOMINATIM_PATH} {
  resolver 127.0.0.11 valid=30s ipv6=off;
  set $nominatim_upstream "${origin}";
  rewrite ^/${NOMINATIM_PATH}(.*)$ ${basePath}/$1 break;
  proxy_pass $nominatim_upstream;
  proxy_set_header Host $proxy_host;
  proxy_read_timeout 30s;
}
`;
}

/**
 * Writes JSON via a temporary file and a rename, so nginx — already
 * serving if this is a rescan — can never hand the app half a file.
 */
function writeAtomically(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(temporary, file);
}
