import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  footprintOf,
  groundHeightUnder,
  initialPlacement,
  isPlaceable,
  placementHint,
  verticalShift,
  WORLDWIDE_RADIUS,
  type TilesetFootprint,
} from './placeTilesetOnTerrain';
import { terrainHeightmap } from '@/cesium/terrainHeightmap';
import { geoidHeightAt, loadI3sSceneLayer } from './loadI3sSceneLayer';
import { applyDrape, createDrapeShader, drapeArea } from './terrainDrape';
import type { ModelConfig, ModelPlacement } from './modelTypes';
import { sectionRange } from './modelFilter';
import { fetchPropertyNames } from './tilesetPropertyNames';

export interface ManagedModel {
  config: ModelConfig;
  visible: boolean;
  primitive: Cesium.Cesium3DTileset | Cesium.I3SDataProvider;
  tilesets: Cesium.Cesium3DTileset[];
  footprint: TilesetFootprint | null;
  placement: ModelPlacement;
  offset: number;
  reason: string | null;
  credit: Cesium.Credit | null;
  propertyNames: Record<string, string>;
  sectionRange: { min: number; max: number } | null;
  geoidConverted: boolean;
}

export function useModels(viewer: Cesium.Viewer | null) {
  const [models, setModels] = useState<ManagedModel[]>([]);
  const modelsRef = useRef<ManagedModel[]>([]);
  useLayoutEffect(() => {
    modelsRef.current = models;
  });

  const drapeTokensRef = useRef(new Map<string, number>());
  const drape = useCallback(
    async (id: string, entry: DrapeTarget, on: boolean) => {
      const token = (drapeTokensRef.current.get(id) ?? 0) + 1;
      drapeTokensRef.current.set(id, token);
      if (!viewer || !on) {
        applyDrape(entry.tilesets, undefined);
        return;
      }
      await drapeModel(viewer, entry, () => drapeTokensRef.current.get(id) === token);
    },
    [viewer],
  );

  const offsetFor = useCallback(
    async (footprint: TilesetFootprint | null, placement: ModelPlacement) => {
      if (!viewer || !footprint || placement === 'as-authored') return 0;
      return (await groundUnder(viewer, footprint)) - footprint.base;
    },
    [viewer],
  );

  const addModel = useCallback(
    async (config: ModelConfig, { flyTo = true }: { flyTo?: boolean } = {}) => {
      if (!viewer) return;

      if (config.format === 'i3s') {
        const scene = await loadI3sSceneLayer(config.url, config.name);
        const { provider, tilesets: parts, geoidConverted } = scene;
        const draped = config.placement ? config.placement !== 'as-authored' : scene.groundRelative;
        viewer.scene.primitives.add(provider);
        const copyright = sceneLayerCopyright(provider);
        const credit = copyright ? new Cesium.Credit(copyright, true) : null;
        if (credit) viewer.creditDisplay.addStaticCredit(credit);
        let reason: string | null = 'Georeferenced (I3S)';
        if (draped) reason = config.placement ? null : 'Ground-relative layer';
        const entry: ManagedModel = {
          config,
          visible: true,
          primitive: provider,
          tilesets: parts,
          footprint: null,
          placement: draped ? 'draped' : 'as-authored',
          offset: 0,
          reason,
          credit,
          propertyNames: {},
          sectionRange: null,
          geoidConverted,
        };
        setModels((prev) => [...prev, entry]);
        frameOrLight(viewer, parts, flyTo);
        if (draped) await drape(config.id, entry, true);
        return;
      }

      const [tileset, json] = await Promise.all([
        Cesium.Cesium3DTileset.fromUrl(config.url, { showCreditsOnScreen: true }),
        fetch(config.url)
          .then((response): Promise<unknown> | null => (response.ok ? response.json() : null))
          .catch(() => null),
      ]);

      const bounds = footprintOf(json);
      const footprint = bounds && isPlaceable(bounds) ? bounds : null;
      let placement: ModelPlacement = 'as-authored';
      let reason: string | null = footprint
        ? null
        : bounds
          ? 'Too large to move'
          : 'No bounds in tileset.json';
      let offset = 0;
      const hint = config.placement ?? placementHint(json);
      if (footprint) {
        const ground = await groundUnder(viewer, footprint);
        ({ placement, reason } = initialPlacement(footprint, ground, hint));
        if (config.placement) reason = null;
        if (placement === 'on-terrain') offset = ground - footprint.base;
        tileset.modelMatrix = verticalShift(footprint.center, offset);
      } else if (hint === 'draped' || hint === 'on-terrain') {
        placement = 'draped';
        reason = null;
      }

      viewer.scene.primitives.add(tileset);
      const propertyNames = await fetchPropertyNames(json, config.url);
      const copyright = copyrightOf(json);
      const credit = copyright ? new Cesium.Credit(copyright, true) : null;
      if (credit) viewer.creditDisplay.addStaticCredit(credit);
      const entry: ManagedModel = {
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
        geoidConverted: false,
      };
      setModels((prev) => [...prev, entry]);
      frameOrLight(viewer, [tileset], flyTo);
      if (placement === 'draped') await drape(config.id, entry, true);
    },
    [viewer, drape],
  );

  const setPlacement = useCallback(
    async (id: string, placement: ModelPlacement) => {
      const target = modelsRef.current.find((entry) => entry.config.id === id);
      if (!target) return;
      const record = (offset: number) =>
        setModels((prev) =>
          prev.map((entry) =>
            entry.config.id === id ? { ...entry, placement, offset, reason: null } : entry,
          ),
        );
      const draped = placement === 'draped';
      if (draped || target.placement === 'draped') void drape(id, target, draped);
      if (!target.footprint) {
        record(0);
        return;
      }
      const offset = await offsetFor(target.footprint, draped ? 'as-authored' : placement);
      moveTilesets(target, verticalShift(target.footprint.center, offset));
      record(offset);
    },
    [offsetFor, drape],
  );

  useEffect(() => {
    if (!viewer) return;
    let latest = 0;
    const reseat = async () => {
      if (!currentTerrain(viewer)) return;
      const run = ++latest;
      const updates = await Promise.all(
        modelsRef.current
          .filter((entry) => entry.placement === 'on-terrain' && entry.footprint)
          .map(async (entry) => ({
            entry,
            offset: await offsetFor(entry.footprint, 'on-terrain'),
          })),
      );
      if (run !== latest || viewer.isDestroyed()) return;
      for (const { entry, offset } of updates) {
        if (entry.footprint) {
          moveTilesets(entry, verticalShift(entry.footprint.center, offset));
        }
      }
      for (const entry of modelsRef.current) {
        if (entry.placement === 'draped') void drape(entry.config.id, entry, true);
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
  }, [viewer, offsetFor, drape]);

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

const EVEN_AMBIENT_LIGHT = Array.from({ length: 9 }, (_, index) =>
  index === 0 ? new Cesium.Cartesian3(0.6, 0.6, 0.6) : Cesium.Cartesian3.ZERO,
);

function copyrightOf(tilesetJson: unknown): string | null {
  const copyright = (tilesetJson as { asset?: { copyright?: unknown } } | null)?.asset?.copyright;
  return typeof copyright === 'string' && copyright.trim() ? copyright : null;
}

function sceneLayerCopyright(provider: Cesium.I3SDataProvider): string | null {
  const texts = new Set<string>();
  for (const layer of provider.layers) {
    const text = (layer.data as { copyrightText?: unknown } | undefined)?.copyrightText;
    if (typeof text === 'string' && text.trim()) texts.add(text.trim());
  }
  return texts.size > 0 ? [...texts].join(' · ') : null;
}

// scene.setTerrain leaves terrainProvider undefined while loading, despite the types.
function currentTerrain(viewer: Cesium.Viewer): Cesium.TerrainProvider | undefined {
  return viewer.terrainProvider as Cesium.TerrainProvider | undefined;
}

function nextTerrain(viewer: Cesium.Viewer): Promise<void> {
  return new Promise((resolve) => {
    const remove = viewer.scene.terrainProviderChanged.addEventListener(() => {
      remove();
      resolve();
    });
  });
}

type DrapeTarget = Pick<ManagedModel, 'primitive' | 'tilesets' | 'geoidConverted'>;

async function drapeModel(
  viewer: Cesium.Viewer,
  entry: DrapeTarget,
  stillWanted: () => boolean,
): Promise<void> {
  const provider = currentTerrain(viewer);
  if (!provider) return;
  const current = () =>
    stillWanted() && !viewer.isDestroyed() && viewer.terrainProvider === provider;
  const heightmap = await terrainHeightmap(provider, drapeArea(entry.primitive));
  if (!current()) return;
  if (!heightmap) {
    applyDrape(entry.tilesets, undefined);
    return;
  }
  const datum = entry.geoidConverted
    ? await geoidHeightAt(
        new Cesium.Cartographic(
          heightmap.west + (heightmap.width * heightmap.texelWidth) / 2,
          heightmap.south + (heightmap.height * heightmap.texelHeight) / 2,
        ),
      )
    : 0;
  if (!current()) return;
  applyDrape(entry.tilesets, createDrapeShader(heightmap, datum));
}

function moveTilesets(entry: ManagedModel, modelMatrix: Cesium.Matrix4) {
  for (const tileset of entry.tilesets) tileset.modelMatrix = modelMatrix;
}

function frameOrLight(viewer: Cesium.Viewer, tilesets: Cesium.Cesium3DTileset[], flyTo: boolean) {
  const regional = tilesets.filter((tileset) => tileset.boundingSphere.radius < WORLDWIDE_RADIUS);
  for (const tileset of tilesets) {
    if (!regional.includes(tileset)) {
      tileset.imageBasedLighting.sphericalHarmonicCoefficients = EVEN_AMBIENT_LIGHT;
    }
  }
  if (flyTo && regional.length === tilesets.length) flyToTilesets(viewer, tilesets);
}

function flyToTilesets(viewer: Cesium.Viewer, tilesets: Cesium.Cesium3DTileset[]) {
  const spheres = tilesets.map((tileset) => tileset.boundingSphere);
  const [first, ...rest] = spheres;
  if (!first) return;
  viewer.camera.flyToBoundingSphere(
    rest.reduce((union, sphere) => Cesium.BoundingSphere.union(union, sphere), first),
  );
}

async function groundUnder(viewer: Cesium.Viewer, footprint: TilesetFootprint): Promise<number> {
  for (;;) {
    const provider = currentTerrain(viewer);
    if (!provider) {
      await nextTerrain(viewer);
      continue;
    }
    const ground = await groundHeightUnder(provider, footprint);
    if (viewer.isDestroyed() || viewer.terrainProvider === provider) return ground;
  }
}
