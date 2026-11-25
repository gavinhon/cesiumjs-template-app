import { useCallback, useState } from 'react';
import * as Cesium from 'cesium';
import { BASEMAPS, DEFAULT_BASEMAP } from '@/cesium/basemaps';
import { moveItem } from '@/lib/moveItem';
import { createImageryProvider } from './createImageryProvider';
import { createVectorDataSource } from './createVectorDataSource';
import type { ManagedImageryLayer, ManagedVectorLayer, MapServiceConfig } from './mapServiceTypes';

const BASE_LAYER_ID = 'base-imagery';

const WEB_MERCATOR_EXTENT = new Cesium.WebMercatorTilingScheme().rectangle;

function flyToImagery(viewer: Cesium.Viewer, layer: Cesium.ImageryLayer) {
  const rectangle = layer.imageryProvider?.rectangle;
  const knowsWhereItIs =
    rectangle !== undefined &&
    !Cesium.Rectangle.equals(rectangle, Cesium.Rectangle.MAX_VALUE) &&
    !Cesium.Rectangle.equals(rectangle, WEB_MERCATOR_EXTENT);

  if (knowsWhereItIs) {
    viewer.flyTo(layer).catch(() => {});
  } else {
    viewer.camera.flyHome(1);
  }
}

function isRegional(rectangle: Cesium.Rectangle | undefined): rectangle is Cesium.Rectangle {
  return rectangle !== undefined && Cesium.Rectangle.computeWidth(rectangle) < Math.PI;
}

const KIND_LABEL: Record<MapServiceConfig['type'], string> = {
  wms: 'WMS',
  wmts: 'WMTS',
  xyz: 'XYZ',
  wfs: 'WFS',
  geojson: 'GEOJSON',
  'arcgis-map': 'ARCGIS MAP',
  'arcgis-feature': 'ARCGIS FEATURE',
};

export function useMapServices(viewer: Cesium.Viewer | null) {
  const [imagery, setImagery] = useState<ManagedImageryLayer[]>([]);
  const [vectors, setVectors] = useState<ManagedVectorLayer[]>([]);
  const [basemapId, setBasemapId] = useState(DEFAULT_BASEMAP.id);

  const [adoptedViewer, setAdoptedViewer] = useState<Cesium.Viewer | null>(null);
  if (viewer && viewer !== adoptedViewer) {
    setAdoptedViewer(viewer);
    const baseLayer = viewer.imageryLayers.get(0);
    if (baseLayer) {
      setImagery((prev) => {
        if (prev.some((entry) => entry.id === BASE_LAYER_ID)) return prev;
        return [
          {
            id: BASE_LAYER_ID,
            name: DEFAULT_BASEMAP.name,
            kind: DEFAULT_BASEMAP.kind,
            cesiumLayer: baseLayer,
            config: null,
            visible: baseLayer.show,
            alpha: baseLayer.alpha,
            removable: false,
          },
          ...prev,
        ];
      });
    }
  }

  const addLayer = useCallback(
    async (config: MapServiceConfig, { flyTo = true }: { flyTo?: boolean } = {}) => {
      if (!viewer) return;

      if (config.type === 'wfs' || config.type === 'geojson' || config.type === 'arcgis-feature') {
        const dataSource = await createVectorDataSource(config);
        await viewer.dataSources.add(dataSource);
        setVectors((prev) => [
          ...prev,
          {
            id: config.id,
            name: config.name,
            kind: KIND_LABEL[config.type],
            dataSource,
            visible: true,
          },
        ]);
        if (flyTo) viewer.flyTo(dataSource).catch(() => {});
        return;
      }

      const provider = await createImageryProvider(config);
      const cesiumLayer = viewer.imageryLayers.addImageryProvider(provider);
      setImagery((prev) => [
        ...prev,
        {
          id: config.id,
          name: config.name,
          kind: KIND_LABEL[config.type],
          cesiumLayer,
          config,
          visible: true,
          alpha: 1,
          removable: true,
        },
      ]);

      if (flyTo && isRegional(provider.rectangle)) {
        viewer.flyTo(cesiumLayer).catch(() => {});
      }
    },
    [viewer],
  );

  const removeLayer = useCallback(
    (id: string) => {
      if (!viewer) return;
      setImagery((prev) => {
        const target = prev.find((entry) => entry.id === id);
        if (!target || !target.removable) return prev;
        viewer.imageryLayers.remove(target.cesiumLayer, true);
        return prev.filter((entry) => entry.id !== id);
      });
      setVectors((prev) => {
        const target = prev.find((entry) => entry.id === id);
        if (!target) return prev;
        viewer.dataSources.remove(target.dataSource, true);
        return prev.filter((entry) => entry.id !== id);
      });
    },
    [viewer],
  );

  const toggleVisibility = useCallback((id: string) => {
    setImagery((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        const visible = !entry.visible;
        entry.cesiumLayer.show = visible;
        return { ...entry, visible };
      }),
    );
    setVectors((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        const visible = !entry.visible;
        entry.dataSource.show = visible;
        return { ...entry, visible };
      }),
    );
  }, []);

  const setAlpha = useCallback((id: string, alpha: number) => {
    setImagery((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        entry.cesiumLayer.alpha = alpha;
        return { ...entry, alpha };
      }),
    );
  }, []);

  const zoomToLayer = useCallback(
    (id: string) => {
      if (!viewer) return;
      const layer = imagery.find((entry) => entry.id === id);
      if (layer) {
        flyToImagery(viewer, layer.cesiumLayer);
        return;
      }
      const vector = vectors.find((entry) => entry.id === id);
      if (vector) {
        viewer.flyTo(vector.dataSource).catch(() => {});
      }
    },
    [viewer, imagery, vectors],
  );

  const moveImagery = useCallback(
    (id: string, toIndex: number) => {
      if (!viewer) return;

      const index = imagery.findIndex((entry) => entry.id === id);
      const floor = imagery[0]?.id === BASE_LAYER_ID ? 1 : 0;
      if (index === -1 || toIndex < floor || toIndex >= imagery.length || toIndex === index) return;

      const { cesiumLayer } = imagery[index];
      // Not idempotent: keep outside setState updaters (StrictMode runs them twice).
      for (let step = index; step < toIndex; step++) viewer.imageryLayers.raise(cesiumLayer);
      for (let step = index; step > toIndex; step--) viewer.imageryLayers.lower(cesiumLayer);

      setImagery(moveItem(imagery, index, toIndex));
    },
    [viewer, imagery],
  );

  const setBasemap = useCallback(
    (id: string) => {
      if (!viewer) return;
      const basemap = BASEMAPS.find((entry) => entry.id === id);
      const current = imagery.find((entry) => entry.id === BASE_LAYER_ID);
      if (!basemap || !current) return;

      const collection = viewer.imageryLayers;
      const index = collection.indexOf(current.cesiumLayer);
      const cesiumLayer = basemap.createLayer();
      cesiumLayer.show = current.visible;
      cesiumLayer.alpha = current.alpha;
      collection.add(cesiumLayer, index);
      collection.remove(current.cesiumLayer, true);

      setImagery((prev) =>
        prev.map((entry) =>
          entry.id === BASE_LAYER_ID
            ? { ...entry, name: basemap.name, kind: basemap.kind, cesiumLayer }
            : entry,
        ),
      );
      setBasemapId(id);
    },
    [viewer, imagery],
  );

  return {
    basemaps: BASEMAPS,
    basemapId,
    setBasemap,
    imagery,
    vectors,
    addLayer,
    removeLayer,
    toggleVisibility,
    setAlpha,
    zoomToLayer,
    moveImagery,
  };
}
