/**
 * Keeps LTA's live traffic snapshots current for the Docker image: reads
 * congestion and incidents from DataMall on their timers and writes them
 * where nginx serves them (`/live/`, see docker/nginx.conf).
 *
 *     LTA_ACCOUNT_KEY=… node scripts/fetchLiveTraffic.ts --out /run/app/live
 *
 * Started in the background by `docker/docker-entrypoint.sh` when
 * `LTA_ACCOUNT_KEY` is set and the deployment isn't offline, and runs for
 * the container's life. It's the container's counterpart of the dev
 * server's `liveTrafficFeed` plugin, and shares all its logic — this file
 * only decides where the snapshots go. Run as-is by Node's type stripping,
 * like `writeRuntimeConfig.ts`.
 *
 * The key comes from the environment, not an argument, so it never shows
 * in the process list.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startLiveTrafficFeed } from '../vite-plugins/liveTrafficFeed.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const outDir = values.out;
const accountKey = process.env.LTA_ACCOUNT_KEY?.trim();
if (!outDir || !accountKey) {
  console.error('Usage: LTA_ACCOUNT_KEY=<key> node fetchLiveTraffic.ts --out <folder>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

startLiveTrafficFeed({
  accountKey,
  // Written beside the target and renamed over it, so nginx never serves a
  // half-written snapshot to a map that's refreshing.
  publish: (file, json) => {
    const target = path.join(outDir, file);
    writeFileSync(`${target}.tmp`, json);
    renameSync(`${target}.tmp`, target);
  },
});
console.log(`Live traffic: reading LTA DataMall into ${outDir}.`);
