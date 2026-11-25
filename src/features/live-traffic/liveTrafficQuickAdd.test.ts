import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '@/lib/appConfig';
import { LIVE_TRAFFIC_QUICK_ADD } from './liveTrafficQuickAdd';

describe('LIVE_TRAFFIC_QUICK_ADD', () => {
  it('offers nothing where no server reads LTA (no key, GitHub Pages, offline)', () => {
    expect(APP_CONFIG.liveTraffic).toBeUndefined();
    expect(LIVE_TRAFFIC_QUICK_ADD).toEqual([]);
  });
});
