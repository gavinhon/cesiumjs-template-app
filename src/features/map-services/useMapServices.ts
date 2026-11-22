import { useCallback, useState } from 'react';
import * as Cesium from 'cesium';
import { BASEMAPS, DEFAULT_BASEMAP } from '@/cesium/basemaps';
import { moveItem } from '@/lib/moveItem';
import { createImageryProvider } from './createImageryProvider';
import { createVectorDataSource } from './createVectorDataSource';
import type { ManagedImageryLayer, ManagedVectorLayer, MapServiceConfig } from './mapServiceTypes';

/** Stable id for the base map, so re-seeding can recognise it. */
const BASE_LAYER_ID = 'base-imagery';

/**
 * The full extent of a Web Mercator tiling scheme — the whole world, minus
 * the poles it can't project (±85.051°). Providers that don't know their
 * own extent report this, so it reads as "no idea", not as a location.
 */
const WEB_MERCATOR_EXTENT = new Cesium.WebMercatorTilingScheme().rectangle;

/**
 * Flies to a layer, for an explicit "zoom to this" request.
 *
 * `provider.rectangle` is not a reliable "where is this layer" answer: a
 * provider that doesn't know its own extent reports its *tiling scheme's*
 * extent instead, which is the whole world. Which value you get depends on
 * the scheme — `Rectangle.MAX_VALUE` for the geographic one (WMS's
 * default), the slightly shorter Web Mercator extent for XYZ. Either way it
 * means "no idea", and `flyTo` on a whole-world rectangle drops the camera
 * at (0°, 0°), off the coast of west Africa.
 *
 * Since the user asked to go somewhere, we always move: to the real extent
 * when the provider has one, and otherwise to a clean whole-globe view via
 * `flyHome`, which is the honest rendering of "everywhere".
 */
function flyToImagery(viewer: Cesium.Viewer, layer: Cesium.ImageryLayer) {
  const rectangle = layer.imageryProvider?.rectangle;
  const knowsWhereItIs =
    rectangle !== undefined &&
    !Cesium.Rectangle.equals(rectangle, Cesium.Rectangle.MAX_VALUE) &&
    !Cesium.Rectangle.equals(rectangle, WEB_MERCATOR_EXTENT);

  if (knowsWhereItIs) {
    viewer.flyTo(layer).catch(() => {
      // A rejected flyTo (e.g. the layer was removed mid-flight) isn't
      // worth surfacing to the user.
    });
  } else {
    viewer.camera.flyHome(1);
  }
}

/**
 * Whether an extent is a place worth flying to unasked. One wider than half
 * the world isn't: flying "to" it just pulls the camera out to space,
 * losing wherever the user was looking.
 */
function isRegional(rectangle: Cesium.Rectangle | undefined): rectangle is Cesium.Rectangle {
  return rectangle !== undefined && Cesium.Rectangle.computeWidth(rectangle) < Math.PI;
}

/** Short badge text per service type, shown in the layer lists. */
const KIND_LABEL: Record<MapServiceConfig['type'], string> = {
  wms: 'WMS',
  wmts: 'WMTS',
  xyz: 'XYZ',
  wfs: 'WFS',
  geojson: 'GEOJSON',
  'arcgis-map': 'ARCGIS MAP',
  'arcgis-feature': 'ARCGIS FEATURE',
};

/**
 * Owns every map service and file layer the app can put on the globe, and keeps it in sync
 * with Cesium.
 *
 * Two collections, because OGC services come in two flavours (see
 * `./mapServiceTypes.ts`):
 *
 *  - `imagery` mirrors `viewer.imageryLayers` — raster layers draped on the
 *    globe, in draw order, **index 0 = bottom**.
 *  - `vectors` mirrors the `viewer.dataSources` this feature added — WFS
 *    features and GeoJSON files, which are entities in 3D space rather
 *    than a texture.
 *
 * The imagery list deliberately includes the base map that `CesiumMap`
 * created, even though the user didn't add it. The layer manager has to be
 * able to reorder the whole stack, and a hook that only knew about half of
 * `viewer.imageryLayers` would compute the wrong indices the moment
 * anything moved below the base map.
 *
 * As everywhere in this app, each action performs the Cesium side effect
 * *and* updates React state, so the panel and the globe can't disagree.
 */
export function useMapServices(viewer: Cesium.Viewer | null) {
  const [imagery, setImagery] = useState<ManagedImageryLayer[]>([]);
  const [vectors, setVectors] = useState<ManagedVectorLayer[]>([]);
  // Which of `BASEMAPS` is at the bottom of the stack. `CesiumMap` starts
  // the Viewer with the default one.
  const [basemapId, setBasemapId] = useState(DEFAULT_BASEMAP.id);

  // Adopt the base map once the viewer exists. `CesiumMap` passes it as the
  // Viewer's `baseLayer` option, which puts it at index 0 of the imagery
  // collection before any of our code runs.
  //
  // Done during the render in which the viewer first appears, not in an
  // effect: nothing is being synchronised *to* Cesium here — the layer is
  // already on the globe — we're only reading it into React state, and an
  // effect would commit one render with an empty layer list first (the
  // layer manager and the shared-link restore, which waits for this, would
  // both see it). Remembering which viewer was adopted is what makes it
  // happen once per viewer and lets the second pass settle.
  const [adoptedViewer, setAdoptedViewer] = useState<Cesium.Viewer | null>(null);
  if (viewer && viewer !== adoptedViewer) {
    setAdoptedViewer(viewer);
    const baseLayer = viewer.imageryLayers.get(0);
    if (baseLayer) {
      setImagery((prev) => {
        // Guard against React StrictMode's double-invoke re-seeding a second
        // copy, and against wiping layers the user has already added.
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

  /**
   * Adds a layer of any supported type.
   *
   * Async because most types read something from the server before we know
   * whether it worked — WFS, ArcGIS and GeoJSON fetch their features, an
   * ArcGIS MapServer its description. The form awaits this so it can show a
   * loading state and surface a failure, rather than adding a layer that
   * silently isn't there.
   */
  const addLayer = useCallback(
    // Pass `flyTo: false` when restoring a shared link: its camera is the point.
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
        // Unlike imagery, a loaded data source always knows where its
        // features are, so flying to it is unconditionally useful.
        if (flyTo)
          viewer.flyTo(dataSource).catch(() => {
            // See flyToImagery.
          });
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

      // Auto-fly only to a layer that is somewhere in particular. As
      // described at `flyToImagery`, a provider that doesn't know its extent
      // reports the whole world, and flying to that every time someone adds
      // a global overlay would throw away wherever they were looking.
      if (flyTo && isRegional(provider.rectangle)) {
        viewer.flyTo(cesiumLayer).catch(() => {
          // See flyToImagery.
        });
      }
    },
    [viewer],
  );

  const removeLayer = useCallback(
    (id: string) => {
      if (!viewer) return;
      setImagery((prev) => {
        const target = prev.find((entry) => entry.id === id);
        // The base map isn't the user's to delete.
        if (!target || !target.removable) return prev;
        // `true` also destroys the underlying WebGL textures/provider.
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

  // Explicitly requested by the user (double-clicking a layer's name), so
  // unlike the auto-fly in `addLayer`, this always flies somewhere.
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
        viewer.flyTo(vector.dataSource).catch(() => {
          // See flyToImagery.
        });
      }
    },
    [viewer, imagery, vectors],
  );

  /**
   * Moves an imagery layer to `toIndex` in the draw order — what dropping a
   * dragged row in the layer list does.
   *
   * Indices are Cesium's: 0 is the bottom of the stack, a higher index is
   * drawn later and covers more. Cesium's `raise`/`lower` move by one
   * position in `viewer.imageryLayers`, and our `imagery` array is kept in
   * exactly that order, so the two stay in lockstep.
   *
   * Note the Cesium call happens *outside* the `setImagery` updater. React
   * StrictMode deliberately double-invokes state updater functions in
   * development to surface impure ones, and `raise`/`lower` are not
   * idempotent — running one twice would move the layer two positions and
   * desynchronise it from this array. (The other actions here get away with
   * side effects inside their updaters only because assigning `show`,
   * `alpha`, or removing an already-removed layer *is* idempotent.)
   */
  const moveImagery = useCallback(
    (id: string, toIndex: number) => {
      if (!viewer) return;

      const index = imagery.findIndex((entry) => entry.id === id);
      // Never to or past the basemap at index 0: the layer list doesn't
      // show it, so a drop "below everything" means just above it.
      const floor = imagery[0]?.id === BASE_LAYER_ID ? 1 : 0;
      if (index === -1 || toIndex < floor || toIndex >= imagery.length || toIndex === index) return;

      // One step at a time with raise/lower — the collection's own
      // reordering calls — rather than removing the layer and re-adding it
      // at the new index, which would fire layerRemoved/layerAdded as if it
      // had left the map and come back.
      const { cesiumLayer } = imagery[index];
      for (let step = index; step < toIndex; step++) viewer.imageryLayers.raise(cesiumLayer);
      for (let step = index; step > toIndex; step--) viewer.imageryLayers.lower(cesiumLayer);

      setImagery(moveItem(imagery, index, toIndex));
    },
    [viewer, imagery],
  );

  /**
   * Swaps the basemap for another from `BASEMAPS`.
   *
   * An `ImageryLayer`'s provider can't be changed after it's created, so
   * this replaces the whole layer — at the old one's position in the stack,
   * so anything the user added stays on top of it, even after reordering.
   * The visibility and opacity set on the old layer carry over.
   *
   * The Cesium calls happen before, not inside, the state updater: adding a
   * layer isn't idempotent (see `moveImagery`).
   */
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
    /** Every basemap on offer, and which one is showing. */
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
