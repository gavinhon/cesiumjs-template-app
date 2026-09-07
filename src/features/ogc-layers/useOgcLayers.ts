import { useCallback, useEffect, useState } from 'react';
import * as Cesium from 'cesium';
import { createImageryProvider } from './createImageryProvider';
import { createWfsDataSource } from './createWfsDataSource';
import type {
  ManagedImageryLayer,
  ManagedVectorLayer,
  OgcImageryConfig,
  OgcLayerConfig,
} from './types';

/** Stable id for the base map, so re-seeding can recognise it. */
const BASE_LAYER_ID = 'base-imagery';

/**
 * The full extent of a Web Mercator tiling scheme — the whole world, minus
 * the poles it can't project (±85.051°). Providers that don't know their
 * own extent report this, so it reads as "no idea", not as a location.
 */
const WEB_MERCATOR_EXTENT = new Cesium.WebMercatorTilingScheme().rectangle;

/** Short badge text per service type, shown in the layer lists. */
const KIND_LABEL: Record<OgcLayerConfig['type'], string> = {
  wms: 'WMS',
  wmts: 'WMTS',
  xyz: 'XYZ',
  wfs: 'WFS',
};

/**
 * Owns everything the OGC panel can put on the globe, and keeps it in sync
 * with Cesium.
 *
 * Two collections, because OGC services come in two flavours (see
 * `./types.ts`):
 *
 *  - `imagery` mirrors `viewer.imageryLayers` — raster layers draped on the
 *    globe, in draw order, **index 0 = bottom**.
 *  - `vectors` mirrors the `viewer.dataSources` this feature added — WFS
 *    features, which are entities in 3D space rather than a texture.
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
export function useOgcLayers(viewer: Cesium.Viewer | null) {
  const [imagery, setImagery] = useState<ManagedImageryLayer[]>([]);
  const [vectors, setVectors] = useState<ManagedVectorLayer[]>([]);

  // Adopt the base map once the viewer exists. `CesiumMap` passes it as the
  // Viewer's `baseLayer` option, which puts it at index 0 of the imagery
  // collection before any of our code runs.
  useEffect(() => {
    if (!viewer) return;
    const baseLayer = viewer.imageryLayers.get(0);
    if (!baseLayer) return;

    setImagery((prev) => {
      // Guard against React StrictMode's double-invoke re-seeding a second
      // copy, and against wiping layers the user has already added.
      if (prev.some((entry) => entry.id === BASE_LAYER_ID)) return prev;
      return [
        {
          id: BASE_LAYER_ID,
          name: 'OpenStreetMap',
          kind: 'OSM',
          cesiumLayer: baseLayer,
          visible: baseLayer.show,
          alpha: baseLayer.alpha,
          removable: false,
        },
        ...prev,
      ];
    });
  }, [viewer]);

  /**
   * Flies to a layer, for an explicit "zoom to this" request.
   *
   * `provider.rectangle` is not a reliable "where is this layer" answer: a
   * provider that doesn't know its own extent reports its *tiling scheme's*
   * extent instead, which is the whole world. Which value you get depends
   * on the scheme — `Rectangle.MAX_VALUE` for the geographic one (WMS's
   * default), the slightly shorter Web Mercator extent for XYZ. Either way
   * it means "no idea", and `flyTo` on a whole-world rectangle drops the
   * camera at (0°, 0°), off the coast of west Africa.
   *
   * Since the user asked to go somewhere, we always move: to the real
   * extent when the provider has one, and otherwise to a clean whole-globe
   * view via `flyHome`, which is the honest rendering of "everywhere".
   */
  const flyToImagery = useCallback((cesiumViewer: Cesium.Viewer, layer: Cesium.ImageryLayer) => {
    const rectangle = layer.imageryProvider?.rectangle;
    const knowsWhereItIs =
      rectangle !== undefined &&
      !Cesium.Rectangle.equals(rectangle, Cesium.Rectangle.MAX_VALUE) &&
      !Cesium.Rectangle.equals(rectangle, WEB_MERCATOR_EXTENT);

    if (knowsWhereItIs) {
      cesiumViewer.flyTo(layer).catch(() => {
        // A rejected flyTo (e.g. the layer was removed mid-flight) isn't
        // worth surfacing to the user.
      });
    } else {
      cesiumViewer.camera.flyHome(1);
    }
  }, []);

  const addImageryLayer = useCallback((cesiumViewer: Cesium.Viewer, config: OgcImageryConfig) => {
    const provider = createImageryProvider(config);
    const cesiumLayer = cesiumViewer.imageryLayers.addImageryProvider(provider);

    setImagery((prev) => [
      ...prev,
      {
        id: config.id,
        name: config.name,
        kind: KIND_LABEL[config.type],
        cesiumLayer,
        visible: true,
        alpha: 1,
        removable: true,
      },
    ]);

    // Auto-fly only when the *config* carries a real extent — i.e. the user
    // picked this layer from a capabilities lookup, so we know where it is.
    // Deliberately not inferred from `provider.rectangle`: as described
    // above that reports a whole-world extent for layers whose location is
    // unknown, so trusting it would yank the camera out to a global view
    // every time someone adds an XYZ overlay, losing wherever they were
    // looking — the exact thing this guard exists to prevent.
    if ('boundingBox' in config && config.boundingBox) {
      cesiumViewer.flyTo(cesiumLayer).catch(() => {
        // See flyToImagery.
      });
    }
  }, []);

  /**
   * Adds a layer of any supported type.
   *
   * Async because WFS actually fetches and parses features before we know
   * whether it worked — the form awaits this so it can show a loading state
   * and surface a failure, rather than adding a layer that silently isn't
   * there.
   */
  const addLayer = useCallback(
    async (config: OgcLayerConfig) => {
      if (!viewer) return;

      if (config.type === 'wfs') {
        const dataSource = await createWfsDataSource(config);
        await viewer.dataSources.add(dataSource);
        setVectors((prev) => [
          ...prev,
          {
            id: config.id,
            name: config.name,
            kind: KIND_LABEL.wfs,
            dataSource,
            visible: true,
          },
        ]);
        // Unlike imagery, a loaded data source always knows where its
        // features are, so flying to it is unconditionally useful.
        viewer.flyTo(dataSource).catch(() => {
          // See flyToImagery.
        });
        return;
      }

      addImageryLayer(viewer, config);
    },
    [viewer, addImageryLayer],
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
    [viewer, imagery, vectors, flyToImagery],
  );

  /**
   * Moves an imagery layer one step through the draw order.
   *
   * `'up'` means toward the top of the stack (drawn later, covers more);
   * `'down'` is the reverse. Cesium's `raise`/`lower` move by one position
   * in `viewer.imageryLayers`, and our `imagery` array is kept in exactly
   * that order, so the two stay in lockstep.
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
    (id: string, direction: 'up' | 'down') => {
      if (!viewer) return;

      const index = imagery.findIndex((entry) => entry.id === id);
      if (index === -1) return;
      const targetIndex = direction === 'up' ? index + 1 : index - 1;
      if (targetIndex < 0 || targetIndex >= imagery.length) return;

      const entry = imagery[index];
      if (direction === 'up') {
        viewer.imageryLayers.raise(entry.cesiumLayer);
      } else {
        viewer.imageryLayers.lower(entry.cesiumLayer);
      }

      const next = [...imagery];
      next[index] = next[targetIndex];
      next[targetIndex] = entry;
      setImagery(next);
    },
    [viewer, imagery],
  );

  return {
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
