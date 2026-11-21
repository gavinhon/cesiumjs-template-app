import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  footprintOf,
  groundHeightUnder,
  initialPlacement,
  placementHint,
  verticalShift,
  type TilesetFootprint,
} from './placeTilesetOnTerrain';
import type { TilesetConfig, TilesetPlacement } from './tilesetTypes';

export interface ManagedTileset {
  config: TilesetConfig;
  visible: boolean;
  tileset: Cesium.Cesium3DTileset;
  /**
   * Where the model was authored, or `null` if its tileset.json declares no
   * usable bounds — then it can't be placed and stays as authored.
   */
  footprint: TilesetFootprint | null;
  placement: TilesetPlacement;
  /** Metres the model is currently moved up (negative: down). 0 when as authored. */
  offset: number;
  /** Why the placement was chosen automatically, shown beside it — e.g. "Underground". */
  reason: string | null;
}

/**
 * Owns the list of 3D Tiles datasets the user has connected, and keeps it
 * in sync with the Cesium viewer's `scene.primitives` collection — the
 * `Cesium3DTileset` equivalent of what `useOgcLayers` does for
 * `imageryLayers`.
 *
 * Each tileset is set on the terrain when it loads, unless it's
 * underground — see `placeTilesetOnTerrain.ts` — and set again whenever
 * the terrain changes, so choosing a different terrain (or none) in the
 * layer manager carries the models with it.
 *
 * Unlike our WMS/WMTS/XYZ imagery layers, a `Cesium3DTileset` always knows
 * its own real bounding volume once loaded, so we can unconditionally fly
 * to it on add — no "only if we know the extent" guard needed here.
 */
export function useTilesets(viewer: Cesium.Viewer | null) {
  const [tilesets, setTilesets] = useState<ManagedTileset[]>([]);
  // Read by the terrain-change listener, which is subscribed once.
  const tilesetsRef = useRef<ManagedTileset[]>([]);
  tilesetsRef.current = tilesets;

  /**
   * How far to move a model for a placement, on the terrain that's loaded
   * now. Applying it is a separate, synchronous step, so callers can drop a
   * result that a later terrain change has made stale.
   */
  const offsetFor = useCallback(
    async (footprint: TilesetFootprint | null, placement: TilesetPlacement) => {
      if (!viewer || !footprint || placement === 'as-authored') return 0;
      return (await groundUnder(viewer, footprint)) - footprint.base;
    },
    [viewer],
  );

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
      //
      // The JSON is fetched alongside for its bounding volume, which
      // Cesium doesn't expose publicly (see `footprintOf`). The browser
      // cache makes the second request essentially free.
      const [tileset, json] = await Promise.all([
        Cesium.Cesium3DTileset.fromUrl(config.url),
        fetch(config.url)
          .then((response): Promise<unknown> | null => (response.ok ? response.json() : null))
          .catch(() => null),
      ]);

      const footprint = footprintOf(json);
      let placement: TilesetPlacement = 'as-authored';
      let reason: string | null = footprint ? null : 'No bounds in tileset.json';
      let offset = 0;
      if (footprint) {
        const ground = await groundUnder(viewer, footprint);
        ({ placement, reason } = initialPlacement(footprint, ground, placementHint(json)));
        if (placement === 'on-terrain') offset = ground - footprint.base;
        tileset.modelMatrix = verticalShift(footprint.center, offset);
      }

      // Placed before it's added, so it never appears at the wrong height
      // and the fly-to below heads for where it actually ends up.
      viewer.scene.primitives.add(tileset);
      setTilesets((prev) => [
        ...prev,
        { config, visible: true, tileset, footprint, placement, offset, reason },
      ]);

      viewer.flyTo(tileset).catch(() => {
        // A rejected flyTo (e.g. the tileset was removed before it
        // finished loading) isn't worth surfacing to the user.
      });
    },
    [viewer],
  );

  /** Switches a tileset between standing on the terrain and its authored height. */
  const setPlacement = useCallback(
    async (id: string, placement: TilesetPlacement) => {
      const target = tilesetsRef.current.find((entry) => entry.config.id === id);
      if (!target?.footprint) return;
      const offset = await offsetFor(target.footprint, placement);
      target.tileset.modelMatrix = verticalShift(target.footprint.center, offset);
      setTilesets((prev) =>
        prev.map((entry) =>
          // A choice the user made replaces whatever was chosen for them.
          entry.config.id === id ? { ...entry, placement, offset, reason: null } : entry,
        ),
      );
    },
    [offsetFor],
  );

  // The ground moved: re-seat every model standing on it. Cesium fires
  // `terrainProviderChanged` once a newly chosen terrain is ready (not when
  // it's chosen), so the samples below see the new surface.
  useEffect(() => {
    if (!viewer) return;
    let latest = 0;
    const reseat = async () => {
      const run = ++latest;
      const updates = await Promise.all(
        tilesetsRef.current
          .filter((entry) => entry.placement === 'on-terrain' && entry.footprint)
          .map(async (entry) => ({
            entry,
            offset: await offsetFor(entry.footprint, 'on-terrain'),
          })),
      );
      // A quicker second terrain change has already re-seated them.
      if (run !== latest || viewer.isDestroyed()) return;
      for (const { entry, offset } of updates) {
        if (entry.footprint) {
          entry.tileset.modelMatrix = verticalShift(entry.footprint.center, offset);
        }
      }
      const offsets = new Map(updates.map(({ entry, offset }) => [entry.config.id, offset]));
      setTilesets((prev) =>
        prev.map((entry) => {
          const offset = offsets.get(entry.config.id);
          return offset === undefined ? entry : { ...entry, offset };
        }),
      );
    };
    return viewer.scene.terrainProviderChanged.addEventListener(() => void reseat());
  }, [viewer, offsetFor]);

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

  return { tilesets, addTileset, removeTileset, toggleVisibility, zoomToTileset, setPlacement };
}

/**
 * The ground height under a footprint on whatever terrain is loaded once
 * sampling finishes.
 *
 * Sampling takes a moment, and the terrain can change during it — most
 * often at startup, when the app's own terrain is still loading as a
 * dataset is added. The terrain-change listener can't catch that case:
 * the tileset isn't in the list yet. So if the provider changed while we
 * sampled, sample again on the new one.
 */
async function groundUnder(viewer: Cesium.Viewer, footprint: TilesetFootprint): Promise<number> {
  for (;;) {
    const provider = viewer.terrainProvider;
    const ground = await groundHeightUnder(provider, footprint);
    if (viewer.isDestroyed() || viewer.terrainProvider === provider) return ground;
  }
}
