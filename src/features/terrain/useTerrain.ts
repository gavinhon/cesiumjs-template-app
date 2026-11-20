import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { enableHillshade } from '@/cesium/hillshadeLight';
import { publicDatasetsOfKind } from '@/lib/publicDatasets';
import type { PublicTerrainDataset } from '@/lib/publicDatasetTypes';

/** Terrain tilesets found under `public/` at build time. */
const PUBLIC_TERRAINS = publicDatasetsOfKind('terrain');

/**
 * Owns which terrain the globe is drawn on: one of the terrain tilesets
 * found in `public/`, or none — the bare WGS84 ellipsoid the app starts
 * with.
 *
 * **Terrain is a single slot, not a list.** Imagery stacks and tilesets
 * accumulate, but the globe has exactly one surface. So this hook holds a
 * selection rather than a collection, and the UI is a picker rather than
 * add/remove.
 *
 * **Terrain loads itself.** When `public/` holds a terrain tileset, the
 * first one is selected as soon as the viewer exists — it's the ground the
 * rest of the map sits on, like the base imagery, not an overlay you opt
 * into. Choose "None" in the layer manager to go back to the ellipsoid.
 *
 * **Loaded the way Cesium currently recommends:** `scene.setTerrain` with a
 * `Cesium.Terrain` wrapping the provider's promise, rather than awaiting
 * the provider and assigning `viewer.terrainProvider`. `setTerrain` cancels
 * a still-loading terrain when another is chosen, so a slow first choice
 * can't land after a fast second one and silently undo it. Vertex normals
 * are requested so the terrain can be hillshaded — see `enableHillshade`.
 *
 * No Cesium ion is involved: `CesiumTerrainProvider` reads any static
 * folder with a `layer.json`, and `scripts/build_terrain_tiles.py` writes
 * one from a GeoTIFF.
 */
export function useTerrain(viewer: Cesium.Viewer | null) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `setTerrain` already makes the *globe* honour only the latest choice;
  // this does the same for the panel's loading/error state, which would
  // otherwise report on whichever request happened to settle last.
  const latestRequest = useRef(0);
  // What's actually on the globe, for snapping the picker back on failure.
  const appliedId = useRef<string | null>(null);
  // Undoes the hillshade lighting. Present exactly when real terrain is on
  // the globe: shading a perfectly smooth ellipsoid only darkens the map.
  const disableHillshade = useRef<(() => void) | null>(null);

  const selectTerrain = useCallback(
    async (id: string | null, { flyToIfOffscreen = true } = {}) => {
      if (!viewer) return;
      const request = ++latestRequest.current;
      const dataset = id === null ? null : PUBLIC_TERRAINS.find((entry) => entry.id === id);
      if (id !== null && !dataset) return;

      setSelectedId(id);
      setError(null);
      setLoading(dataset !== null);

      const terrain = new Cesium.Terrain(
        dataset
          ? Cesium.CesiumTerrainProvider.fromUrl(dataset.url, { requestVertexNormals: true })
          : // "None" goes through setTerrain too, so it also cancels a
            // terrain that's still loading instead of being overwritten by it.
            Promise.resolve(new Cesium.EllipsoidTerrainProvider()),
      );
      viewer.scene.setTerrain(terrain);

      try {
        await terrainReady(terrain);
        if (request !== latestRequest.current || viewer.isDestroyed()) return;
        appliedId.current = id;

        if (dataset && !disableHillshade.current) {
          disableHillshade.current = enableHillshade(viewer.scene);
        } else if (!dataset && disableHillshade.current) {
          disableHillshade.current();
          disableHillshade.current = null;
        }
        if (dataset && flyToIfOffscreen) flyToIfNotInView(viewer, dataset);
      } catch (cause) {
        if (request !== latestRequest.current) return;
        setSelectedId(appliedId.current);
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (request === latestRequest.current) setLoading(false);
      }
    },
    [viewer],
  );

  // Preload the first terrain once there's a viewer to put it on. No
  // fly-to: the camera is wherever the app chose to start it, and terrain
  // arriving shouldn't move it.
  useEffect(() => {
    const first = PUBLIC_TERRAINS[0];
    if (!viewer || !first) return;
    void selectTerrain(first.id, { flyToIfOffscreen: false });
  }, [viewer, selectTerrain]);

  const zoomToSelected = useCallback(() => {
    if (!viewer) return;
    const dataset = PUBLIC_TERRAINS.find((entry) => entry.id === selectedId);
    if (dataset?.bounds) viewer.camera.flyTo({ destination: rectangleOf(dataset.bounds) });
  }, [viewer, selectedId]);

  return {
    /** Every terrain on offer, in `public/` path order. */
    options: PUBLIC_TERRAINS,
    selectedId,
    loading,
    error,
    selectTerrain,
    zoomToSelected,
  };
}

/**
 * `Cesium.Terrain` reports through events rather than a promise; this
 * turns its two outcomes into one awaitable.
 */
function terrainReady(terrain: Cesium.Terrain): Promise<void> {
  if (terrain.ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const removeReady = terrain.readyEvent.addEventListener(() => {
      removeReady();
      removeError();
      resolve();
    });
    const removeError = terrain.errorEvent.addEventListener((error: unknown) => {
      removeReady();
      removeError();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function rectangleOf([west, south, east, north]: [number, number, number, number]) {
  return Cesium.Rectangle.fromDegrees(west, south, east, north);
}

/**
 * Terrain only covers its own patch of the world. Choosing it while looking
 * somewhere else changes nothing visible, which reads as "it didn't work" —
 * so take the camera there, unless the patch is already on screen.
 */
function flyToIfNotInView(viewer: Cesium.Viewer, dataset: PublicTerrainDataset) {
  if (!dataset.bounds) return;
  const target = rectangleOf(dataset.bounds);
  const inView = viewer.camera.computeViewRectangle();
  if (inView && Cesium.Rectangle.intersection(inView, target)) return;
  viewer.camera.flyTo({ destination: target });
}
