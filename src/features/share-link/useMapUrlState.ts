import { useCallback, useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import {
  decodeMapUrlState,
  encodeMapUrlState,
  terrainForLink,
  type MapUrlState,
} from './mapUrlState';

export interface ShareableState {
  basemapId: string;
  terrainId: string | null;
  defaultTerrainId: string | null;
  is2D: boolean;
  layerIds: string[];
}

export interface MapStateRestorers {
  setBasemap: (id: string) => void;
  setTerrain: (id: string | null) => void;
  addLayer: (id: string) => Promise<boolean>;
}

export function useMapUrlState(
  viewer: Cesium.Viewer | null,
  ready: boolean,
  current: ShareableState,
  restore: MapStateRestorers,
) {
  const restoredRef = useRef(false);
  const writeReadyRef = useRef(false);
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

  useEffect(() => {
    if (!viewer || !ready || restoredRef.current) return;
    restoredRef.current = true;
    const state = decodeMapUrlState(window.location.hash);
    void apply(viewer, state, restoreRef.current).finally(() => {
      writeReadyRef.current = true;
      write();
    });
  }, [viewer, ready, write]);

  useEffect(() => {
    if (!viewer) return;
    return viewer.camera.moveEnd.addEventListener(write);
  }, [viewer, write]);

  const layerKey = current.layerIds.join('\n');
  useEffect(write, [write, current.basemapId, current.terrainId, current.is2D, layerKey]);

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
    terrain: terrainForLink(current.terrainId, current.defaultTerrainId),
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
  if (state.mode === '2d') viewer.scene.morphTo2D(0);
  if (state.basemap) restore.setBasemap(state.basemap);
  if (state.terrain !== undefined) restore.setTerrain(state.terrain);

  for (const id of state.layers ?? []) {
    try {
      await restore.addLayer(id);
    } catch {}
  }
}
