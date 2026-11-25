import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import type { FeatureCardContent } from '@/cesium/FeatureInfoCard';
import { pickSurface } from '@/cesium/pickSurface';
import type { LiveTrafficLayerId } from './liveTrafficQuickAdd';
import { roadCategoryName, speedBandLabel } from './trafficPresentation';
import {
  busiestAhead,
  clockTime,
  CROWD_NOW,
  crowdLevelName,
  lineLevelAt,
  lineName,
} from './crowdPresentation';
import type { useLiveTraffic } from './useLiveTraffic';
import type { MrtCrowdSnapshot } from '@/lib/liveTrafficTypes';

export interface InspectedTraffic extends FeatureCardContent {
  layer: LiveTrafficLayerId;
  station?: string;
}

type Traffic = Pick<
  ReturnType<typeof useLiveTraffic>,
  'layers' | 'linkAt' | 'crowdSnapshot' | 'crowdTime'
>;

function crowdCard(
  snapshot: MrtCrowdSnapshot,
  name: string,
  time: string,
  position: Cesium.Cartesian3,
): InspectedTraffic | null {
  const station = snapshot.stations.find((candidate) => candidate.name === name);
  if (!station) return null;
  const window = `${clockTime(snapshot.windowStart)}–${clockTime(snapshot.windowEnd)}`;
  return {
    layer: 'crowd',
    station: name,
    title: name,
    layerName: 'MRT & LRT crowding',
    rows: [
      {
        key: 'Shown for',
        value: time === CROWD_NOW ? `Now, ${window}` : `Forecast, ${clockTime(time)}`,
      },
      ...station.lines.map((line) => ({
        key: line.code,
        value: `${crowdLevelName(lineLevelAt(snapshot, line, time))} · ${lineName(line.line)}`,
      })),
      {
        key: 'Busiest later',
        value: busiestAhead(snapshot, station, Date.parse(snapshot.fetchedAt)),
      },
    ],
    position,
  };
}

function inspectAt(
  viewer: Cesium.Viewer,
  { linkAt, layers, crowdSnapshot, crowdTime }: Traffic,
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

  if (id instanceof Cesium.Entity && shown('crowd') && crowdSnapshot) {
    const index: unknown = id.properties?.getValue(viewer.clock.currentTime)?.mrtCrowdStation;
    const station = typeof index === 'number' ? crowdSnapshot.stations[index] : undefined;
    return station ? crowdCard(crowdSnapshot, station.name, crowdTime, position) : null;
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
  traffic: Traffic,
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
      setInspected(inspectAt(viewer, trafficRef.current, event.position));
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

  const current =
    inspected?.station && traffic.crowdSnapshot
      ? crowdCard(traffic.crowdSnapshot, inspected.station, traffic.crowdTime, inspected.position)
      : inspected;
  return { inspected: current, close: () => setInspected(null) };
}
