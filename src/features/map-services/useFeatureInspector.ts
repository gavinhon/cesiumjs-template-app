import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { pickSurface } from '@/cesium/pickSurface';
import { readAttributes, type AttributeRow } from './featureAttributes';
import type { ManagedVectorLayer } from './mapServiceTypes';
import { styleVectorEntity } from './vectorFeatureStyle';

/** A clicked vector feature: what the info card shows, and where it's pinned. */
export interface InspectedFeature {
  entity: Cesium.Entity;
  layerId: string;
  layerName: string;
  /** The feature's name if a field looks like one, otherwise its layer's. */
  title: string;
  rows: AttributeRow[];
  /** The clicked point on the surface, which the card stays pinned to. */
  position: Cesium.Cartesian3;
}

/** The entity under a window position, if there is one. */
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

/**
 * The vector feature under a click, read for the info card — or null for a
 * click on anything else (empty map, a drawing, a 3D model).
 */
function inspectAt(
  viewer: Cesium.Viewer,
  layers: ManagedVectorLayer[],
  windowPosition: Cesium.Cartesian2,
): InspectedFeature | null {
  const entity = entityAt(viewer, windowPosition);
  if (!entity) return null;
  // Our layers only: drawings are entities too, and handle their own clicks.
  const layer = layers.find(
    (candidate) => candidate.visible && candidate.dataSource.entities.getById(entity.id) === entity,
  );
  if (!layer) return null;

  const time = viewer.clock.currentTime;
  // Pinned where the user clicked rather than to the feature's centre: a
  // polygon's centre can be far off screen, or outside the polygon itself.
  const position = pickSurface(viewer, windowPosition) ?? entity.position?.getValue(time);
  if (!position) return null;

  // GeoJSON `properties` arrive as a PropertyBag; its value is the plain
  // object the server sent.
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

/**
 * Makes the features of WFS, ArcGIS and GeoJSON layers clickable: a click
 * on one selects it — highlighted on the map — and returns its attributes
 * for `<FeatureInfoCard>`. A click anywhere else, Escape, or the card's
 * close button clears it.
 *
 * **Only while no drawing tool is armed** (`enabled`). Arming a tool is
 * this app's mode switch: with one armed, a click draws, and must not also
 * open a card. Drawings handle their own clicks for the same reason, so
 * the two never compete for one.
 *
 * It owns a separate `ScreenSpaceEventHandler` rather than sharing the
 * drawing tools': handlers stack, each gets every click, and keeping them
 * apart is what keeps this feature from importing that one.
 */
export function useFeatureInspector(
  viewer: Cesium.Viewer | null,
  layers: ManagedVectorLayer[],
  enabled: boolean,
) {
  const [inspected, setInspected] = useState<InspectedFeature | null>(null);
  // Read by the click handler, which is subscribed once per viewer.
  const layersRef = useRef(layers);
  const enabledRef = useRef(enabled);
  // Kept current in a layout effect, not by assigning during render: React
  // may render without committing (StrictMode, concurrent rendering), and a
  // render-time write would leak a value that never reached the screen. A
  // layout effect runs right after commit, before any input event can.
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

  // The highlight lasts exactly as long as the selection. Restyling is
  // idempotent, so StrictMode's double-run is harmless.
  useEffect(() => {
    if (!inspected) return;
    styleVectorEntity(inspected.entity, true);
    return () => styleVectorEntity(inspected.entity, false);
  }, [inspected]);

  // Arming a tool, or removing or hiding the feature's layer, closes the
  // card: it would otherwise describe something you can no longer see.
  //
  // Cleared during render, not in an effect, so no frame is ever committed
  // with a card describing a hidden layer. It's a real reset rather than a
  // value derived and hidden: showing the layer again or putting the tool
  // down must not bring back a card the user had moved on from. Setting
  // this hook's own state while rendering is allowed, and the next pass
  // has `inspected === null`, so it settles at once.
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
