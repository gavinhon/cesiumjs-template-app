import type { LegendContent } from '@/lib/legendTypes';

/**
 * How live traffic reads on the map and in the layer list — pure functions
 * of LTA's values, kept apart from the Cesium code so they can be tested.
 */

/**
 * How many roads the congestion layer draws. LTA rates ~144,000 links,
 * most of them small roads whose short stretches between junctions read
 * slow (red) whatever the traffic — so the default is the main roads,
 * where red really means congestion.
 */
export type RoadDetail = 'main' | 'arterial' | 'all';

export const ROAD_DETAIL: Record<RoadDetail, { label: string; categories: ReadonlySet<number> }> = {
  main: { label: 'Main roads', categories: new Set([1, 2]) },
  arterial: { label: 'Main and arterial roads', categories: new Set([1, 2, 3, 4]) },
  all: { label: 'Every road', categories: new Set([1, 2, 3, 4, 5, 6, 8]) },
};

export const ROAD_DETAIL_ORDER: readonly RoadDetail[] = ['main', 'arterial', 'all'];

/** LTA's road categories, as the info card names them. */
const ROAD_CATEGORY: Record<number, string> = {
  1: 'Expressway',
  2: 'Major arterial road',
  3: 'Arterial road',
  4: 'Minor arterial road',
  5: 'Small road',
  6: 'Slip road',
  8: 'Short tunnel',
};

export function roadCategoryName(category: number): string {
  return ROAD_CATEGORY[category] ?? 'Road';
}

/** "20–29 km/h" for band 3; LTA's bands are 10 km/h wide, the last open-ended. */
export function speedBandLabel(band: number): string {
  if (band < 1 || band > 8) return 'No reading';
  if (band === 8) return '70 km/h or more';
  return `${(band - 1) * 10}–${band * 10 - 1} km/h`;
}

/** The congestion legend: one swatch per band, slowest first, in the `--traffic-*` tokens. */
export function congestionLegend(): LegendContent {
  return {
    kind: 'swatches',
    items: [1, 2, 3, 4, 5, 6, 7, 8].map((band) => ({
      label: speedBandLabel(band),
      color: `var(--traffic-${band})`,
      shape: 'line' as const,
    })),
  };
}

export function incidentLegend(): LegendContent {
  return {
    kind: 'swatches',
    items: [{ label: 'Accident, breakdown, roadwork…', color: 'var(--incident)', shape: 'point' }],
  };
}

/** Older than this, a snapshot is called out as stale: LTA updates every 2–5 minutes. */
const STALE_MS = 15 * 60_000;

/**
 * "Updated just now", "Updated 4 min ago" — and a warning once it's old
 * enough that the server has evidently stopped reading LTA.
 */
export function describeAge(fetchedAt: string, now: number): { text: string; stale: boolean } {
  const age = now - Date.parse(fetchedAt);
  if (!Number.isFinite(age)) return { text: 'Updated at an unknown time', stale: true };
  const minutes = Math.max(0, Math.floor(age / 60_000));
  const text =
    minutes < 1
      ? 'Updated just now'
      : minutes < 120
        ? `Updated ${minutes} min ago`
        : `Updated ${Math.floor(minutes / 60)} h ago`;
  return { text, stale: age > STALE_MS };
}
