import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  footprintOf,
  groundHeightUnder,
  initialPlacement,
  isPlaceable,
  placementHint,
  verticalShift,
  type TilesetFootprint,
} from './placeTilesetOnTerrain';
import { loadI3sSceneLayer } from './loadI3sSceneLayer';
import type { ModelConfig, ModelPlacement } from './modelTypes';
import { sectionRange } from './modelFilter';
import { fetchPropertyNames } from './tilesetPropertyNames';

export interface ManagedModel {
  config: ModelConfig;
  visible: boolean;
  /**
   * What was added to `scene.primitives`: the tileset itself, or for I3S
   * the provider that streams it. Showing and removing act on this.
   */
  primitive: Cesium.Cesium3DTileset | Cesium.I3SDataProvider;
  /**
   * The tilesets that make it up — just the one for 3D Tiles, one per layer
   * for I3S. Placing the model moves these, and zooming frames them.
   */
  tilesets: Cesium.Cesium3DTileset[];
  /**
   * Where the model was authored, or `null` if it can't be placed and stays
   * as authored: a tileset.json without usable bounds, or any I3S scene.
   */
  footprint: TilesetFootprint | null;
  placement: ModelPlacement;
  /** Metres the model is currently moved up (negative: down). 0 when as authored. */
  offset: number;
  /** Why the placement was chosen automatically, shown beside it — e.g. "Underground". */
  reason: string | null;
  /** The dataset's own attribution, shown on the map while it's loaded. See `copyrightOf`. */
  credit: Cesium.Credit | null;
  /**
   * Display names of its parts' properties, by id, from its metadata schema
   * (`fetchPropertyNames`) — what the info card labels a clicked part with.
   * Empty for I3S, and for tilesets without a schema.
   */
  propertyNames: Record<string, string>;
  /**
   * Heights a section cut can move through, in the tileset's clipping frame
   * (`sectionRange`); `null` when that frame isn't known, or for I3S.
   */
  sectionRange: { min: number; max: number } | null;
}

/**
 * Owns the list of 3D datasets the user has connected — 3D Tiles and I3S
 * scene layers — and keeps it in sync with the Cesium viewer's
 * `scene.primitives` collection: the 3D equivalent of what `useMapServices`
 * does for `imageryLayers`.
 *
 * Each 3D Tiles model is set on the terrain when it loads, unless it's
 * underground — see `placeTilesetOnTerrain.ts` — and set again whenever
 * the terrain changes, so choosing a different terrain (or none) in the
 * layer manager carries the models with it.
 *
 * I3S scenes are left where they're authored. They're georeferenced to
 * real heights (see `loadI3sSceneLayer`), and their declared bounds are
 * padded far beyond the geometry — hundreds of metres in Esri's own
 * samples — so "lift its lowest point onto the ground" would misplace
 * them by that much.
 *
 * Unlike our WMS/WMTS/XYZ imagery layers, a loaded tileset always knows
 * its own real bounding volume, so we can unconditionally fly to it on
 * add — no "only if we know the extent" guard needed here.
 */
export function useModels(viewer: Cesium.Viewer | null) {
  const [models, setModels] = useState<ManagedModel[]>([]);
  // Read by the terrain-change listener, which is subscribed once.
  const modelsRef = useRef<ManagedModel[]>([]);
  // Kept current in a layout effect, not by assigning during render: React
  // may render without committing (StrictMode, concurrent rendering), and a
  // render-time write would leak a value that never reached the screen. A
  // layout effect runs right after commit, before any input event can.
  useLayoutEffect(() => {
    modelsRef.current = models;
  });

  /**
   * How far to move a model for a placement, on the terrain that's loaded
   * now. Applying it is a separate, synchronous step, so callers can drop a
   * result that a later terrain change has made stale.
   */
  const offsetFor = useCallback(
    async (footprint: TilesetFootprint | null, placement: ModelPlacement) => {
      if (!viewer || !footprint || placement === 'as-authored') return 0;
      return (await groundUnder(viewer, footprint)) - footprint.base;
    },
    [viewer],
  );

  const addModel = useCallback(
    // Pass `flyTo: false` when restoring a shared link: its camera is the point.
    async (config: ModelConfig, { flyTo = true }: { flyTo?: boolean } = {}) => {
      if (!viewer) return;

      if (config.format === 'i3s') {
        const { provider, tilesets: parts } = await loadI3sSceneLayer(config.url, config.name);
        viewer.scene.primitives.add(provider);
        setModels((prev) => [
          ...prev,
          {
            config,
            visible: true,
            primitive: provider,
            tilesets: parts,
            footprint: null,
            placement: 'as-authored',
            offset: 0,
            reason: 'Georeferenced (I3S)',
            // Cesium credits I3S itself, from each layer's copyright text.
            credit: null,
            propertyNames: {},
            sectionRange: null,
          },
        ]);
        if (flyTo) flyToTilesets(viewer, parts);
        return;
      }

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
        // Credits from the tiles' own glTF go on screen, not into the
        // attribution pop-up: they're often a licence condition (ODbL, CC
        // BY). The tileset.json's credit is added below — see `copyrightOf`.
        Cesium.Cesium3DTileset.fromUrl(config.url, { showCreditsOnScreen: true }),
        fetch(config.url)
          .then((response): Promise<unknown> | null => (response.ok ? response.json() : null))
          .catch(() => null),
      ]);

      // A tileset wider than a city (see `isPlaceable`) is treated like one
      // without bounds: it stays where it was authored, with no switch.
      const bounds = footprintOf(json);
      const footprint = bounds && isPlaceable(bounds) ? bounds : null;
      let placement: ModelPlacement = 'as-authored';
      let reason: string | null = footprint
        ? null
        : bounds
          ? 'Too large to move'
          : 'No bounds in tileset.json';
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
      const propertyNames = await fetchPropertyNames(json, config.url);
      const copyright = copyrightOf(json);
      const credit = copyright ? new Cesium.Credit(copyright, true) : null;
      if (credit) viewer.creditDisplay.addStaticCredit(credit);
      setModels((prev) => [
        ...prev,
        {
          config,
          visible: true,
          primitive: tileset,
          tilesets: [tileset],
          footprint,
          placement,
          offset,
          reason,
          credit,
          propertyNames,
          sectionRange: sectionRange(json),
        },
      ]);
      if (tileset.boundingSphere.radius < REGIONAL_RADIUS) {
        if (flyTo) flyToTilesets(viewer, [tileset]);
      } else {
        // A worldwide layer is everywhere at once: flying "to" it would only
        // pull the camera out to space, away from what the user was viewing.
        // And Cesium lights each tileset's shaded sides with a sky rendered
        // from the centre of its bounds — for a worldwide layer, the centre
        // of the Earth, where the "sky" is black. Every wall facing away from
        // the light renders solid black. A plain, even ambient light instead.
        tileset.imageBasedLighting.sphericalHarmonicCoefficients = EVEN_AMBIENT_LIGHT;
      }
    },
    [viewer],
  );

  /** Switches a tileset between standing on the terrain and its authored height. */
  const setPlacement = useCallback(
    async (id: string, placement: ModelPlacement) => {
      const target = modelsRef.current.find((entry) => entry.config.id === id);
      if (!target?.footprint) return;
      const offset = await offsetFor(target.footprint, placement);
      moveTilesets(target, verticalShift(target.footprint.center, offset));
      setModels((prev) =>
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
        modelsRef.current
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
          moveTilesets(entry, verticalShift(entry.footprint.center, offset));
        }
      }
      const offsets = new Map(updates.map(({ entry, offset }) => [entry.config.id, offset]));
      setModels((prev) =>
        prev.map((entry) => {
          const offset = offsets.get(entry.config.id);
          return offset === undefined ? entry : { ...entry, offset };
        }),
      );
    };
    return viewer.scene.terrainProviderChanged.addEventListener(() => void reseat());
  }, [viewer, offsetFor]);

  const removeModel = useCallback(
    (id: string) => {
      if (!viewer) return;
      setModels((prev) => {
        const target = prev.find((t) => t.config.id === id);
        if (target) {
          viewer.scene.primitives.remove(target.primitive);
          if (target.credit) viewer.creditDisplay.removeStaticCredit(target.credit);
        }
        return prev.filter((t) => t.config.id !== id);
      });
    },
    [viewer],
  );

  const toggleVisibility = useCallback((id: string) => {
    setModels((prev) =>
      prev.map((t) => {
        if (t.config.id !== id) return t;
        const visible = !t.visible;
        t.primitive.show = visible;
        return { ...t, visible };
      }),
    );
  }, []);

  const zoomToModel = useCallback(
    (id: string) => {
      if (!viewer) return;
      const target = models.find((t) => t.config.id === id);
      if (target) flyToTilesets(viewer, target.tilesets);
    },
    [viewer, models],
  );

  return { models, addModel, removeModel, toggleVisibility, zoomToModel, setPlacement };
}

/** Bigger than this (bounding-sphere radius, metres), a tileset isn't anywhere in particular. */
const REGIONAL_RADIUS = 1_000_000;

/**
 * Light from every direction equally, as Cesium's spherical-harmonic
 * coefficients: only the first (constant) term is set. Its strength is
 * chosen by eye to read like an overcast sky against the map light; Cesium's
 * own fallback (0.35) leaves shaded walls nearly black.
 */
const EVEN_AMBIENT_LIGHT = Array.from({ length: 9 }, (_, index) =>
  index === 0 ? new Cesium.Cartesian3(0.6, 0.6, 0.6) : Cesium.Cartesian3.ZERO,
);

/**
 * The attribution a tileset.json declares in `asset.copyright`, if any.
 *
 * Cesium shows the copyright embedded in each tile's glTF, but not this
 * one — and it's where datasets usually put their licence's attribution
 * (Re:Earth Buildings' ODbL notice, for one). It's third-party HTML; Cesium
 * runs credit HTML through DOMPurify before it reaches the page.
 */
function copyrightOf(tilesetJson: unknown): string | null {
  const copyright = (tilesetJson as { asset?: { copyright?: unknown } } | null)?.asset?.copyright;
  return typeof copyright === 'string' && copyright.trim() ? copyright : null;
}

/** Applies one vertical shift to every tileset a model is made of. */
function moveTilesets(entry: ManagedModel, modelMatrix: Cesium.Matrix4) {
  for (const tileset of entry.tilesets) tileset.modelMatrix = modelMatrix;
}

/**
 * Flies to frame one or more tilesets. `viewer.flyTo` takes a single
 * tileset; an I3S building scene can be several, so this frames the
 * bounding sphere around all of them — which is what `viewer.flyTo` does
 * for one, with the same default viewing angle.
 */
function flyToTilesets(viewer: Cesium.Viewer, tilesets: Cesium.Cesium3DTileset[]) {
  const spheres = tilesets.map((tileset) => tileset.boundingSphere);
  const [first, ...rest] = spheres;
  if (!first) return;
  viewer.camera.flyToBoundingSphere(
    rest.reduce((union, sphere) => Cesium.BoundingSphere.union(union, sphere), first),
  );
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
