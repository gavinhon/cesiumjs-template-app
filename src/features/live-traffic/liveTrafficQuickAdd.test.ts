import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '@/lib/appConfig';
import { LIVE_TRAFFIC_QUICK_ADD } from './liveTrafficQuickAdd';

describe('LIVE_TRAFFIC_QUICK_ADD', () => {
  it('offers nothing where no server reads LTA (no key, GitHub Pages, offline)', () => {
    // Under Vitest there's no app-config.json, so this is the default
    // config — exactly what a deployment without an LTA key gets.
    expect(APP_CONFIG.liveTraffic).toBeUndefined();
    expect(LIVE_TRAFFIC_QUICK_ADD).toEqual([]);
  });
});
