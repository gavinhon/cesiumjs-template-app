import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import type { FeatureCardContent } from '@/cesium/FeatureInfoCard';
import { pickSurface } from '@/cesium/pickSurface';
import type { LiveTrafficLayerId } from './liveTrafficQuickAdd';
import { roadCategoryName, speedBandLabel } from './trafficPresentation';
import type { LiveTrafficLayer, useLiveTraffic } from './useLiveTraffic';

/** A clicked road link or incident, for `<FeatureInfoCard>`, and which layer it's from. */
export interface InspectedTraffic extends FeatureCardContent {
  layer: LiveTrafficLayerId;
}

type LinkAt = ReturnType<typeof useLiveTraffic>['linkAt'];

/** What a click on the map picked, read as live traffic — or null for anything else. */
function inspectAt(
  viewer: Cesium.Viewer,
  linkAt: LinkAt,
  layers: LiveTrafficLayer[],
  windowPosition: Cesium.Cartesian2,
): InspectedTraffic | null {
  const picked: unknown = viewer.scene.pick(windowPosition);
  const id: unknown =
    picked && typeof picked === 'object' && 'id' in picked ? picked.id : undefined;
  const position = pickSurface(viewer, windowPosition);
  if (!position) return null;
  const shown = (layer: LiveTrafficLayerId) =>
    layers.some((entry) => entry.layer === layer && entry.visible);

  // A congestion link: the primitive's instance id is its index in the snapshot.
  if (
    id &&
    typeof id === 'object' &&
    'liveTrafficLink' in id &&
    typeof id.liveTrafficLink === 'number'
  ) {
    const found = shown('congestion') ? linkAt(id.liveTrafficLink) : null;
    if (!found) return null;
    const [, , , , band, category] = found.link;
    return {
      layer: 'congestion',
      title: found.road || roadCategoryName(category),
      layerName: 'Traffic congestion',
      rows: [
        { key: 'Speed now', value: speedBandLabel(band) },
        { key: 'Road type', value: roadCategoryName(category) },
      ],
      position,
    };
  }

  // An incident point: an entity flagged in its properties.
  if (id instanceof Cesium.Entity && shown('incidents')) {
    const properties: unknown = id.properties?.getValue(viewer.clock.currentTime);
    if (!properties || typeof properties !== 'object' || !('liveTrafficIncident' in properties))
      return null;
    const { type, message } = properties as { type?: unknown; message?: unknown };
    return {
      layer: 'incidents',
      title: typeof type === 'string' ? type : 'Incident',
      layerName: 'Traffic incidents',
      rows: [{ key: 'LTA report', value: typeof message === 'string' ? message : '' }],
      position,
    };
  }
  return null;
}

/**
 * Makes live traffic clickable: a road link shows its name and current
 * speed, an incident LTA's report, in the shared `<FeatureInfoCard>`. Like
 * the other inspectors it has its own `ScreenSpaceEventHandler`, acts only
 * with no drawing tool armed (`enabled`), and clears on Escape, on a click
 * elsewhere, or when its layer is hidden or removed.
 */
export function useLiveTrafficInspector(
  viewer: Cesium.Viewer | null,
  traffic: Pick<ReturnType<typeof useLiveTraffic>, 'layers' | 'linkAt'>,
  enabled: boolean,
) {
  const [inspected, setInspected] = useState<InspectedTraffic | null>(null);
  const trafficRef = useRef(traffic);
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    trafficRef.current = traffic;
    enabledRef.current = enabled;
  });

  useEffect(() => {
    if (!viewer) return;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (!enabledRef.current) return;
      const { linkAt, layers } = trafficRef.current;
      setInspected(inspectAt(viewer, linkAt, layers, event.position));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [viewer]);

  // Cleared during render, not in an effect, when the card would describe
  // something no longer on screen — the same reset useFeatureInspector does.
  const stale =
    inspected !== null &&
    (!enabled || !traffic.layers.some((entry) => entry.layer === inspected.layer && entry.visible));
  if (stale) setInspected(null);

  useEffect(() => {
    if (!inspected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInspected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspected]);

  return { inspected, close: () => setInspected(null) };
}
