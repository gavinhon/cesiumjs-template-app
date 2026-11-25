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
  publish: (file, json) => {
    const target = path.join(outDir, file);
    writeFileSync(`${target}.tmp`, json);
    renameSync(`${target}.tmp`, target);
  },
});
console.log(`Live traffic: reading LTA DataMall into ${outDir}.`);
