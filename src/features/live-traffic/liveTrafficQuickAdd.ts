import { APP_CONFIG } from '@/lib/appConfig';
import { CATALOGUE_GROUPS } from '@/lib/catalogueGroups';
import type { QuickAddItem } from '@/ui/QuickAddList';

export type LiveTrafficLayerId = 'congestion' | 'incidents' | 'crowd';

export const LIVE_TRAFFIC_QUICK_ADD: readonly { item: QuickAddItem; layer: LiveTrafficLayerId }[] =
  APP_CONFIG.liveTraffic
    ? [
        {
          layer: 'congestion',
          item: {
            id: 'live:traffic-congestion',
            name: 'Traffic congestion',
            badge: 'LTA LIVE',
            source: 'LTA DataMall · speeds every 5 min',
            group: CATALOGUE_GROUPS.live,
          },
        },
        {
          layer: 'incidents',
          item: {
            id: 'live:traffic-incidents',
            name: 'Traffic incidents',
            badge: 'LTA LIVE',
            source: 'LTA DataMall · every 2 min',
            group: CATALOGUE_GROUPS.live,
          },
        },
        {
          layer: 'crowd',
          item: {
            id: 'live:mrt-crowd',
            name: 'MRT & LRT crowding',
            badge: 'LTA LIVE',
            source: 'LTA DataMall · every 10 min, forecast to midnight',
            group: CATALOGUE_GROUPS.live,
          },
        },
      ]
    : [];
