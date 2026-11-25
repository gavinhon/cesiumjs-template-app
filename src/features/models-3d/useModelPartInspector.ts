import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import type { FeatureCardContent } from '@/cesium/FeatureInfoCard';
import { MAP_COLORS } from '@/cesium/mapColors';
import { pickSurface } from '@/cesium/pickSurface';
import { readModelPart } from './modelPartAttributes';
import type { ManagedModel } from './useModels';

export interface InspectedPart extends FeatureCardContent {
  part: Cesium.Cesium3DTileFeature;
  modelId: string;
}

const SELECTED_TINT = MAP_COLORS.accent;

function recolorPart(part: Cesium.Cesium3DTileFeature, color: Cesium.Color): void {
  try {
    part.color = color;
  } catch {}
}

function inspectAt(
  viewer: Cesium.Viewer,
  models: ManagedModel[],
  windowPosition: Cesium.Cartesian2,
): InspectedPart | null {
  const picked: unknown = viewer.scene.pick(windowPosition);
  if (!(picked instanceof Cesium.Cesium3DTileFeature)) return null;
  const model = models.find(
    (candidate) =>
      candidate.visible &&
      candidate.config.format === '3d-tiles' &&
      candidate.tilesets.includes(picked.tileset),
  );
  if (!model) return null;

  const position = pickSurface(viewer, windowPosition);
  if (!position) return null;

  const properties = picked.getPropertyIds().map((id) => ({ id, value: picked.getProperty(id) }));
  const { title, rows } = readModelPart(properties, model.propertyNames);
  return {
    part: picked,
    modelId: model.config.id,
    layerName: model.config.name,
    title: title ?? model.config.name,
    rows,
    position,
  };
}

export function useModelPartInspector(
  viewer: Cesium.Viewer | null,
  models: ManagedModel[],
  enabled: boolean,
) {
  const [inspected, setInspected] = useState<InspectedPart | null>(null);
  const modelsRef = useRef(models);
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    modelsRef.current = models;
    enabledRef.current = enabled;
  });

  useEffect(() => {
    if (!viewer) return;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (!enabledRef.current) return;
      setInspected(inspectAt(viewer, modelsRef.current, event.position));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [viewer]);

  useEffect(() => {
    if (!inspected) return;
    const previous = Cesium.Color.clone(inspected.part.color);
    recolorPart(inspected.part, SELECTED_TINT);
    return () => recolorPart(inspected.part, previous);
  }, [inspected]);

  const stale =
    inspected !== null &&
    (!enabled || !models.some((model) => model.config.id === inspected.modelId && model.visible));
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
