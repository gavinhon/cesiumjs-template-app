import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import type { FeatureCardContent } from '@/cesium/FeatureInfoCard';
import { pickSurface } from '@/cesium/pickSurface';
import type { LiveTrafficLayerId } from './liveTrafficQuickAdd';
import { roadCategoryName, speedBandLabel } from './trafficPresentation';
import type { LiveTrafficLayer, useLiveTraffic } from './useLiveTraffic';

export interface InspectedTraffic extends FeatureCardContent {
  layer: LiveTrafficLayerId;
}

type LinkAt = ReturnType<typeof useLiveTraffic>['linkAt'];

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
