import { APP_CONFIG } from '@/lib/appConfig';
import { CATALOGUE_GROUPS } from '@/lib/catalogueGroups';
import type { QuickAddItem } from '@/ui/QuickAddList';

/** The two live traffic layers. */
export type LiveTrafficLayerId = 'congestion' | 'incidents';

/**
 * Live traffic's entries in the Add data catalogue — and so in search and
 * shared links, which read the same list.
 *
 * **Empty unless this deployment reads LTA** (`APP_CONFIG.liveTraffic`,
 * set by the dev server or the container when there's an LTA key). With
 * no key there is nothing to show, so nothing is offered: no greyed-out
 * row, no "needs a key" message for someone who can't do anything about
 * it. Whoever runs the deployment turns it on by adding the key.
 */
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
      ]
    : [];
