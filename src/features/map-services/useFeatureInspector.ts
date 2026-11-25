import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import type { FeatureCardContent } from '@/cesium/FeatureInfoCard';
import { pickSurface } from '@/cesium/pickSurface';
import { readAttributes } from '@/lib/featureAttributes';
import type { ManagedVectorLayer } from './mapServiceTypes';
import { styleVectorEntity } from './vectorFeatureStyle';

export interface InspectedFeature extends FeatureCardContent {
  entity: Cesium.Entity;
  layerId: string;
}

function entityAt(viewer: Cesium.Viewer, windowPosition: Cesium.Cartesian2): Cesium.Entity | null {
  const picked: unknown = viewer.scene.pick(windowPosition);
  if (
    picked &&
    typeof picked === 'object' &&
    'id' in picked &&
    picked.id instanceof Cesium.Entity
  ) {
    return picked.id;
  }
  return null;
}

function inspectAt(
  viewer: Cesium.Viewer,
  layers: ManagedVectorLayer[],
  windowPosition: Cesium.Cartesian2,
): InspectedFeature | null {
  const entity = entityAt(viewer, windowPosition);
  if (!entity) return null;
  const layer = layers.find(
    (candidate) => candidate.visible && candidate.dataSource.entities.getById(entity.id) === entity,
  );
  if (!layer) return null;

  const time = viewer.clock.currentTime;
  const position = pickSurface(viewer, windowPosition) ?? entity.position?.getValue(time);
  if (!position) return null;

  const properties: unknown = entity.properties?.getValue(time);
  const { title, rows } = readAttributes(
    properties && typeof properties === 'object' ? (properties as Record<string, unknown>) : {},
  );
  return {
    entity,
    layerId: layer.id,
    layerName: layer.name,
    title: title ?? layer.name,
    rows,
    position,
  };
}

export function useFeatureInspector(
  viewer: Cesium.Viewer | null,
  layers: ManagedVectorLayer[],
  enabled: boolean,
) {
  const [inspected, setInspected] = useState<InspectedFeature | null>(null);
  const layersRef = useRef(layers);
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    layersRef.current = layers;
    enabledRef.current = enabled;
  });

  useEffect(() => {
    if (!viewer) return;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (!enabledRef.current) return;
      setInspected(inspectAt(viewer, layersRef.current, event.position));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [viewer]);

  useEffect(() => {
    if (!inspected) return;
    styleVectorEntity(inspected.entity, true);
    return () => styleVectorEntity(inspected.entity, false);
  }, [inspected]);

  const stale =
    inspected !== null &&
    (!enabled || !layers.some((layer) => layer.id === inspected.layerId && layer.visible));
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
