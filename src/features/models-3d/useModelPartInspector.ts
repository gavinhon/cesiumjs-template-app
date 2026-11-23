import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import type { FeatureCardContent } from '@/cesium/FeatureInfoCard';
import { MAP_COLORS } from '@/cesium/mapColors';
import { pickSurface } from '@/cesium/pickSurface';
import { readModelPart } from './modelPartAttributes';
import type { ManagedModel } from './useModels';

/** A clicked part of a 3D model: what the card shows, and what to highlight. */
export interface InspectedPart extends FeatureCardContent {
  part: Cesium.Cesium3DTileFeature;
  modelId: string;
}

/**
 * Tints the selected part — the accent, the app's "this one" colour.
 * Applied by multiplying the part's own colours, so its shading and
 * texture still read through.
 */
const SELECTED_TINT = MAP_COLORS.accent;

/**
 * Sets a part's colour. Its tile may have been unloaded since it was
 * picked — zoomed away, or the model removed — and a feature of destroyed
 * content can't be recoloured; there's nothing left to restore then, so
 * that's not an error.
 */
function recolorPart(part: Cesium.Cesium3DTileFeature, color: Cesium.Color): void {
  try {
    part.color = color;
  } catch {
    // Already gone.
  }
}

/**
 * The model part under a click, read for the info card — or null for a
 * click on anything else.
 *
 * `scene.pick` returns a `Cesium3DTileFeature` for a tileset whose tiles
 * carry per-feature ids: one per IFC element in a BIM conversion
 * (EXT_mesh_features + EXT_structural_metadata), one per building in most
 * city models, or a classic batch table. Its properties are read
 * straight from the loaded tile — no request.
 *
 * I3S is left out: Cesium loads an I3S node's attributes only on request
 * (`I3SNode.loadFields`), through a node it doesn't expose on the picked
 * feature, so a click would open an empty card.
 */
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

/**
 * Makes the parts of 3D Tiles models clickable — each wall, slab and beam
 * of a BIM model, or each building of a city model whose tiles identify
 * them. A click selects the part, tints it, and returns its attributes for
 * `<FeatureInfoCard>`; a click anywhere else, Escape, or the card's close
 * button clears it.
 *
 * The 3D counterpart of `useFeatureInspector` (vector features), with the
 * same rules for the same reasons: only while no drawing tool is armed
 * (`enabled`), and with its own `ScreenSpaceEventHandler` so neither
 * feature imports the other. A click lands on at most one of the two —
 * `scene.pick` returns one object — so they never both open a card.
 */
export function useModelPartInspector(
  viewer: Cesium.Viewer | null,
  models: ManagedModel[],
  enabled: boolean,
) {
  const [inspected, setInspected] = useState<InspectedPart | null>(null);
  // Read by the click handler, which is subscribed once per viewer; kept
  // current after commit, as in useFeatureInspector.
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

  // The tint lasts exactly as long as the selection, restoring whatever
  // colour the part had. Setting a colour is idempotent, so StrictMode's
  // double-run is harmless.
  useEffect(() => {
    if (!inspected) return;
    const previous = Cesium.Color.clone(inspected.part.color);
    recolorPart(inspected.part, SELECTED_TINT);
    return () => recolorPart(inspected.part, previous);
  }, [inspected]);

  // Arming a tool, or hiding or removing the model, closes the card —
  // during render, for the reasons given in useFeatureInspector.
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
