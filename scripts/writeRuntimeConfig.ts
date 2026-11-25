import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { LIVE_TRAFFIC_URL } from '../vite-plugins/liveTrafficFeed.ts';
import { scanPublicFolder } from '../vite-plugins/publicDatasetCatalog.ts';

const CATALOGUE_URL = 'datasets.json';

const NOMINATIM_PATH = 'nominatim/';

interface Upstream {
  origin: string;
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
    'live-traffic': { type: 'string', default: 'false' },
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
const liveTraffic = parseBoolean(values['live-traffic'], '--live-traffic') && !offline;
const nominatim = values['nominatim-upstream'] ? parseUpstream(values['nominatim-upstream']) : null;
const datasets = scanPublicFolder(dataDir, dataUrl);

writeAtomically(path.join(outDir, CATALOGUE_URL), datasets);
writeAtomically(path.join(outDir, 'app-config.json'), {
  offline,
  datasetCatalogue: CATALOGUE_URL,
  ...(values['default-basemap'] && { defaultBasemap: values['default-basemap'] }),
  ...(nominatim && { nominatimUrl: NOMINATIM_PATH }),
  ...(liveTraffic && { liveTraffic: LIVE_TRAFFIC_URL }),
});

const nginxSnippet = path.join(outDir, 'nginx-nominatim.conf');
if (nominatim) writeFileSync(nginxSnippet, nominatimLocation(nominatim));
else rmSync(nginxSnippet, { force: true });

const counts = new Map<string, number>();
for (const dataset of datasets) counts.set(dataset.kind, (counts.get(dataset.kind) ?? 0) + 1);
const summary = [...counts].map(([kind, count]) => `${count} ${kind}`).join(', ') || 'none';
console.log(`Datasets in ${dataDir}: ${summary}. Offline mode: ${offline ? 'on' : 'off'}.`);
console.log(`Live traffic (LTA): ${liveTraffic ? 'on' : 'off'}.`);
if (nominatim) {
  console.log(`Place search: Nominatim at ${nominatim.origin}${nominatim.basePath}/`);
}

function parseBoolean(text: string, flag = '--offline'): boolean {
  const value = text.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off', ''].includes(value)) return false;
  console.error(`${flag} must be true or false, not "${text}"`);
  process.exit(2);
}

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

function writeAtomically(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(temporary, file);
}
