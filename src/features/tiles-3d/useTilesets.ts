import { useCallback, useState } from 'react';
import * as Cesium from 'cesium';
import type { TilesetConfig } from './tilesetTypes';

interface ManagedTileset {
  config: TilesetConfig;
  visible: boolean;
  tileset: Cesium.Cesium3DTileset;
}

/**
 * Owns the list of 3D Tiles datasets the user has connected, and keeps it
 * in sync with the Cesium viewer's `scene.primitives` collection — the
 * `Cesium3DTileset` equivalent of what `useOgcLayers` does for
 * `imageryLayers`.
 *
 * Unlike our WMS/WMTS/XYZ imagery layers, a `Cesium3DTileset` always knows
 * its own real bounding volume once loaded, so we can unconditionally fly
 * to it on add — no "only if we know the extent" guard needed here.
 */
export function useTilesets(viewer: Cesium.Viewer | null) {
  const [tilesets, setTilesets] = useState<ManagedTileset[]>([]);

  const addTileset = useCallback(
    async (config: TilesetConfig) => {
      if (!viewer) return;

      // `config.url` can be an absolute URL (a remote 3D Tiles service, or
      // an S3/CloudFront bucket — no special-casing needed, since from the
      // browser's perspective a CORS-configured bucket is just another
      // `https://` endpoint) or a relative path like
      // "/tilesets/my-data/tileset.json", which resolves against this
      // page's own origin — i.e. how you'd load a dataset placed under
      // this app's own `public/` folder. Either way it needs the server to
      // send CORS headers permitting our origin, same requirement our WMS
      // lookups and imagery tiles have; a same-origin relative URL
      // satisfies that automatically, since there's no cross-origin
      // request to begin with.
      const tileset = await Cesium.Cesium3DTileset.fromUrl(config.url);
      viewer.scene.primitives.add(tileset);
      setTilesets((prev) => [...prev, { config, visible: true, tileset }]);

      viewer.flyTo(tileset).catch(() => {
        // A rejected flyTo (e.g. the tileset was removed before it
        // finished loading) isn't worth surfacing to the user.
      });
    },
    [viewer],
  );

  const removeTileset = useCallback(
    (id: string) => {
      if (!viewer) return;
      setTilesets((prev) => {
        const target = prev.find((t) => t.config.id === id);
        if (target) {
          viewer.scene.primitives.remove(target.tileset);
        }
        return prev.filter((t) => t.config.id !== id);
      });
    },
    [viewer],
  );

  const toggleVisibility = useCallback((id: string) => {
    setTilesets((prev) =>
      prev.map((t) => {
        if (t.config.id !== id) return t;
        const visible = !t.visible;
        t.tileset.show = visible;
        return { ...t, visible };
      }),
    );
  }, []);

  const zoomToTileset = useCallback(
    (id: string) => {
      if (!viewer) return;
      const target = tilesets.find((t) => t.config.id === id);
      if (!target) return;
      viewer.flyTo(target.tileset).catch(() => {
        // A rejected flyTo (e.g. the tileset was removed mid-flight) isn't
        // worth surfacing to the user.
      });
    },
    [viewer, tilesets],
  );

  return { tilesets, addTileset, removeTileset, toggleVisibility, zoomToTileset };
}
