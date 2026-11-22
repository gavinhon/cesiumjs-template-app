import { useCallback, useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { decodeMapUrlState, encodeMapUrlState, type MapUrlState } from './mapUrlState';

/** The parts of the map's state a link carries, as `App` reports them. */
export interface ShareableState {
  basemapId: string;
  terrainId: string | null;
  is2D: boolean;
  /** Catalogue ids of what's on the map — see mapUrlState.ts on why only those. */
  layerIds: string[];
}

/** How to put a link's state back, supplied by `App` from the owning features. */
export interface MapStateRestorers {
  setBasemap: (id: string) => void;
  setTerrain: (id: string | null) => void;
  /** Adds a catalogue dataset without flying to it. False if the id isn't known. */
  addLayer: (id: string) => Promise<boolean>;
}

/**
 * Keeps the address bar's fragment in step with the map, and restores the
 * map from it on load — so a bookmark or a pasted link opens the same view
 * with the same data.
 *
 * Restoring runs once, when `ready` first becomes true. `ready` exists
 * because the basemap switch acts on the imagery stack `useMapServices`
 * adopts from the Viewer one render *after* the Viewer appears; switching
 * before then would find no basemap to replace.
 *
 * Writing starts only after restoring, or the first write would replace
 * the link being restored with the default view. It uses `replaceState`,
 * not `pushState`: every camera move becoming a history entry would make
 * the Back button useless.
 */
export function useMapUrlState(
  viewer: Cesium.Viewer | null,
  ready: boolean,
  current: ShareableState,
  restore: MapStateRestorers,
) {
  const restoredRef = useRef(false);
  const writeReadyRef = useRef(false);
  // The latest values, for the camera listener registered once per viewer
  // and for the restore run, which mustn't re-run when these change.
  const currentRef = useRef(current);
  const restoreRef = useRef(restore);
  useEffect(() => {
    currentRef.current = current;
    restoreRef.current = restore;
  });

  const write = useCallback(() => {
    if (!viewer || viewer.isDestroyed() || !writeReadyRef.current) return;
    const fragment = encodeMapUrlState(stateOf(viewer, currentRef.current));
    window.history.replaceState(null, '', `#${fragment}`);
  }, [viewer]);

  // Restore once.
  useEffect(() => {
    if (!viewer || !ready || restoredRef.current) return;
    restoredRef.current = true;
    const state = decodeMapUrlState(window.location.hash);
    void apply(viewer, state, restoreRef.current).finally(() => {
      writeReadyRef.current = true;
      write();
    });
  }, [viewer, ready, write]);

  // Write when the camera settles. `moveEnd` fires once a pan, zoom or
  // flight finishes — not every frame — which is the right rate for the
  // address bar.
  useEffect(() => {
    if (!viewer) return;
    return viewer.camera.moveEnd.addEventListener(write);
  }, [viewer, write]);

  // …and when anything else in the link changes.
  const layerKey = current.layerIds.join('\n');
  useEffect(write, [write, current.basemapId, current.terrainId, current.is2D, layerKey]);

  /** The link to the current view, freshly written — for the share button. */
  return useCallback(() => {
    write();
    return window.location.href;
  }, [write]);
}

function stateOf(viewer: Cesium.Viewer, current: ShareableState): MapUrlState {
  const { camera } = viewer;
  const position = camera.positionCartographic;
  return {
    camera: {
      longitude: Cesium.Math.toDegrees(position.longitude),
      latitude: Cesium.Math.toDegrees(position.latitude),
      height: position.height,
      heading: Cesium.Math.toDegrees(camera.heading),
      pitch: Cesium.Math.toDegrees(camera.pitch),
    },
    basemap: current.basemapId,
    terrain: current.terrainId,
    mode: current.is2D ? '2d' : '3d',
    layers: current.layerIds,
  };
}

async function apply(viewer: Cesium.Viewer, state: MapUrlState, restore: MapStateRestorers) {
  if (state.camera) {
    const { longitude, latitude, height, heading, pitch } = state.camera;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      orientation: {
        heading: Cesium.Math.toRadians(heading),
        pitch: Cesium.Math.toRadians(pitch),
        roll: 0,
      },
    });
  }
  // After the camera, and with no animation: a morph with any duration
  // flies out to a whole-globe view first (CLAUDE.md, morphTo2D).
  if (state.mode === '2d') viewer.scene.morphTo2D(0);
  if (state.basemap) restore.setBasemap(state.basemap);
  if (state.terrain !== undefined) restore.setTerrain(state.terrain);

  // One at a time, in order: imagery's draw order is the order it's added.
  // A dataset that fails to load (a service that's down today) shouldn't
  // stop the rest of the link from opening.
  for (const id of state.layers ?? []) {
    try {
      await restore.addLayer(id);
    } catch {
      // Left off the map; the link's other layers still load.
    }
  }
}
