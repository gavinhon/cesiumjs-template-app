import { useCallback, useState } from 'react';
import * as Cesium from 'cesium';
import { createImageryProvider } from './createImageryProvider';
import type { ActiveLayer, OgcLayerConfig } from './types';

interface ManagedLayer extends ActiveLayer {
  /** The live Cesium object this entry controls; not stored in `ActiveLayer` itself. */
  cesiumLayer: Cesium.ImageryLayer;
}

/**
 * Owns the list of OGC layers the user has connected, and keeps it in sync
 * with the Cesium viewer's `imageryLayers` collection.
 *
 * This is the bridge between React state (what the sidebar renders) and
 * Cesium state (what's actually drawn on the globe) — every function here
 * mutates the Cesium side effect *and* updates the React list so the two
 * never drift apart.
 */
export function useOgcLayers(viewer: Cesium.Viewer | null) {
  const [layers, setLayers] = useState<ManagedLayer[]>([]);

  const addLayer = useCallback(
    (config: OgcLayerConfig) => {
      if (!viewer) return;

      const provider = createImageryProvider(config);
      const cesiumLayer = viewer.imageryLayers.addImageryProvider(provider);

      setLayers((prev) => [
        ...prev,
        { config, cesiumLayer, visible: true, alpha: 1 },
      ]);

      // We'd like to fly the camera to a newly-added layer's extent so it's
      // immediately visible instead of possibly being off-screen. But none
      // of our providers fetch the server's GetCapabilities document, so
      // Cesium has no real bounding box for them — `provider.rectangle`
      // just defaults to the whole globe (`Rectangle.MAX_VALUE`). Flying to
      // "the whole globe" doesn't zoom out sensibly; it centers the camera
      // on (0°, 0°) — off the coast of west Africa — which would be a
      // confusing jump for data that's actually somewhere else entirely.
      // So: only auto-fly when the provider *does* know its real extent
      // (e.g. you extended `createImageryProvider` to parse capabilities),
      // and otherwise leave the camera where the user left it.
      const rectangle = provider.rectangle;
      if (
        rectangle !== undefined &&
        !Cesium.Rectangle.equals(rectangle, Cesium.Rectangle.MAX_VALUE)
      ) {
        viewer.flyTo(cesiumLayer).catch(() => {
          // A rejected flyTo (e.g. the layer was removed before it
          // finished loading) isn't worth surfacing to the user.
        });
      }
    },
    [viewer],
  );

  const removeLayer = useCallback(
    (id: string) => {
      if (!viewer) return;
      setLayers((prev) => {
        const target = prev.find((l) => l.config.id === id);
        if (target) {
          // `true` also destroys the underlying WebGL textures/provider.
          viewer.imageryLayers.remove(target.cesiumLayer, true);
        }
        return prev.filter((l) => l.config.id !== id);
      });
    },
    [viewer],
  );

  // Explicitly requested by the user (double-clicking a layer's name), so
  // unlike the auto-fly in `addLayer` above, this always flies — even to a
  // whole-globe view for a layer whose real extent we don't know. That's
  // an honest answer to "zoom to layer" rather than a silent no-op.
  const zoomToLayer = useCallback(
    (id: string) => {
      if (!viewer) return;
      const target = layers.find((l) => l.config.id === id);
      if (!target) return;
      viewer.flyTo(target.cesiumLayer).catch(() => {
        // A rejected flyTo (e.g. the layer was removed mid-flight) isn't
        // worth surfacing to the user.
      });
    },
    [viewer, layers],
  );

  const toggleVisibility = useCallback((id: string) => {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.config.id !== id) return l;
        const visible = !l.visible;
        l.cesiumLayer.show = visible;
        return { ...l, visible };
      }),
    );
  }, []);

  const setAlpha = useCallback((id: string, alpha: number) => {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.config.id !== id) return l;
        l.cesiumLayer.alpha = alpha;
        return { ...l, alpha };
      }),
    );
  }, []);

  return { layers, addLayer, removeLayer, toggleVisibility, setAlpha, zoomToLayer };
}
