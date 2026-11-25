import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { enableHillshade } from '@/cesium/hillshadeLight';
import { publicDatasetsOfKind } from '@/lib/publicDatasets';
import type { PublicTerrainDataset } from '@/lib/publicDatasetTypes';

const PUBLIC_TERRAINS = publicDatasetsOfKind('terrain');

const FIRST_TERRAIN: PublicTerrainDataset | null = PUBLIC_TERRAINS[0] ?? null;

const providers = new Map<string, Promise<Cesium.CesiumTerrainProvider>>();

function terrainProvider(dataset: PublicTerrainDataset): Promise<Cesium.CesiumTerrainProvider> {
  let provider = providers.get(dataset.url);
  if (!provider) {
    provider = Cesium.CesiumTerrainProvider.fromUrl(dataset.url, { requestVertexNormals: true });
    providers.set(dataset.url, provider);
    provider.catch(() => providers.delete(dataset.url));
  }
  return provider;
}

export function useTerrain(viewer: Cesium.Viewer | null) {
  const [selectedId, setSelectedId] = useState<string | null>(FIRST_TERRAIN?.id ?? null);
  const [loading, setLoading] = useState(FIRST_TERRAIN !== null);
  const [error, setError] = useState<string | null>(null);

  const latestRequest = useRef(0);
  const appliedId = useRef<string | null>(null);
  const disableHillshade = useRef<(() => void) | null>(null);

  const load = useCallback(
    async (dataset: PublicTerrainDataset | null, flyToIfOffscreen: boolean) => {
      if (!viewer) return;
      const request = ++latestRequest.current;

      const terrain = new Cesium.Terrain(
        dataset ? terrainProvider(dataset) : Promise.resolve(new Cesium.EllipsoidTerrainProvider()),
      );
      viewer.scene.setTerrain(terrain);

      try {
        await terrainReady(terrain);
        if (request !== latestRequest.current || viewer.isDestroyed()) return;
        appliedId.current = dataset?.id ?? null;

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

  const selectTerrain = useCallback(
    async (id: string | null, { flyToIfOffscreen = true } = {}) => {
      if (!viewer) return;
      const dataset = id === null ? null : PUBLIC_TERRAINS.find((entry) => entry.id === id);
      if (id !== null && !dataset) return;

      setSelectedId(id);
      setError(null);
      setLoading(dataset !== null);
      await load(dataset ?? null, flyToIfOffscreen);
    },
    [viewer, load],
  );

  useEffect(() => {
    if (!viewer || !FIRST_TERRAIN) return;
    void load(FIRST_TERRAIN, false);
  }, [viewer, load]);

  const zoomToSelected = useCallback(() => {
    if (!viewer) return;
    const dataset = PUBLIC_TERRAINS.find((entry) => entry.id === selectedId);
    if (dataset?.bounds) viewer.camera.flyTo({ destination: rectangleOf(dataset.bounds) });
  }, [viewer, selectedId]);

  return {
    options: PUBLIC_TERRAINS,
    defaultId: FIRST_TERRAIN?.id ?? null,
    selectedId,
    loading,
    error,
    selectTerrain,
    zoomToSelected,
  };
}

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

function flyToIfNotInView(viewer: Cesium.Viewer, dataset: PublicTerrainDataset) {
  if (!dataset.bounds) return;
  const target = rectangleOf(dataset.bounds);
  const inView = viewer.camera.computeViewRectangle();
  if (inView && Cesium.Rectangle.intersection(inView, target)) return;
  viewer.camera.flyTo({ destination: target });
}
