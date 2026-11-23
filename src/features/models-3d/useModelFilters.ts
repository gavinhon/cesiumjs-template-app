import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';
import {
  filterableAttributes,
  NO_FILTER,
  showExpression,
  type FilterableAttribute,
  type ModelFilter,
} from './modelFilter';
import type { ManagedModel } from './useModels';

/** How long to gather tile loads before re-listing attributes — they arrive in bursts. */
const CATALOGUE_DELAY = 250;

/** Every tile under `tile` (inclusive) whose content is loaded. */
function visitLoaded(tile: Cesium.Cesium3DTile, visit: (tile: Cesium.Cesium3DTile) => void): void {
  visit(tile);
  for (const child of tile.children) visitLoaded(child, visit);
}

/**
 * Filters 3D Tiles models by their parts' attributes — show only the walls,
 * only the parts of one material, only one floor — and cuts them at a
 * height, so the floors below can be seen into.
 *
 * **Which attributes there are** is learned from the model itself: each
 * tile's parts are read as it loads (`tileset.tileLoad`), and the values
 * seen per attribute become the choices (`filterableAttributes`). A model
 * streams in by level of detail, so the lists can grow as more of it
 * loads; for a single building it's all there within a second.
 *
 * **Filtering** sets the tileset's `style` to a `show` expression
 * (`showExpression`): Cesium evaluates it per part, on the GPU path it
 * already uses for styling, so even a city model filters without a
 * per-part loop here. **The section cut** is a single horizontal clipping
 * plane in the tileset's own frame — the public way to cut a model, and
 * what BIM viewers call a section box with one side.
 *
 * Floors come for free when the model carries them as an attribute (an
 * IFC storey, a "Level"): that attribute is detected and offered first.
 * When it doesn't — the storey structure is often dropped in conversion —
 * the section cut is the way to look at one floor.
 *
 * I3S scene layers aren't covered: their attributes load per node on
 * request, not with the geometry (see `useModelPartInspector`).
 */
export function useModelFilters(models: ManagedModel[]) {
  const [filters, setFilters] = useState<Record<string, ModelFilter>>({});
  const [catalogue, setCatalogue] = useState<Record<string, FilterableAttribute[]>>({});

  // Values seen per model, per property — written by tile loads, read when
  // the catalogue is rebuilt. A ref, since tiles load at frame rate.
  const seenRef = useRef(new Map<string, Map<string, Set<string>>>());
  const modelsRef = useRef(models);
  useLayoutEffect(() => {
    modelsRef.current = models;
  });

  // Subscribed per set of models, not per render: a model's record changes
  // every time it's shown, hidden or moved, and none of that changes its
  // tiles.
  const tiled = models.filter((model) => model.config.format === '3d-tiles');
  const tiledKey = tiled.map((model) => model.config.id).join('\n');

  useEffect(() => {
    const seenByModel = seenRef.current;
    const current = modelsRef.current.filter((model) => model.config.format === '3d-tiles');
    const ids = new Set(current.map((model) => model.config.id));
    for (const id of seenByModel.keys()) if (!ids.has(id)) seenByModel.delete(id);

    let timer = 0;
    const rebuild = () => {
      timer = 0;
      const next: Record<string, FilterableAttribute[]> = {};
      for (const model of modelsRef.current) {
        const seen = seenByModel.get(model.config.id);
        if (seen) next[model.config.id] = filterableAttributes(seen, model.propertyNames);
      }
      setCatalogue(next);
    };
    const schedule = () => {
      if (!timer) timer = window.setTimeout(rebuild, CATALOGUE_DELAY);
    };

    const unsubscribes: (() => void)[] = [];
    for (const model of current) {
      const seen = seenByModel.get(model.config.id) ?? new Map<string, Set<string>>();
      seenByModel.set(model.config.id, seen);
      const read = (tile: Cesium.Cesium3DTile) => {
        const content = tile.content;
        if (!content || content.featuresLength === 0) return;
        for (let i = 0; i < content.featuresLength; i++) {
          const feature = content.getFeature(i);
          for (const id of feature.getPropertyIds()) {
            const value: unknown = feature.getProperty(id);
            // Categories are text; numbers (heights, widths) are measures,
            // not something to pick from a list.
            if (typeof value !== 'string') continue;
            let values = seen.get(id);
            if (!values) seen.set(id, (values = new Set()));
            values.add(value);
          }
        }
        schedule();
      };
      for (const tileset of model.tilesets) {
        visitLoaded(tileset.root, read);
        unsubscribes.push(tileset.tileLoad.addEventListener(read));
      }
    }
    schedule();
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      window.clearTimeout(timer);
    };
  }, [tiledKey]);

  // Apply each model's filter to its tilesets. Setting a style is cheap but
  // makes Cesium restyle every loaded part, so it's only replaced when the
  // expression actually changes.
  const appliedRef = useRef(new WeakMap<Cesium.Cesium3DTileset, string>());
  useEffect(() => {
    for (const model of models) {
      if (model.config.format !== '3d-tiles') continue;
      const filter = filters[model.config.id] ?? NO_FILTER;
      const expression = showExpression(filter.attributeId, filter.values);
      for (const tileset of model.tilesets) {
        if (appliedRef.current.get(tileset) !== (expression ?? '')) {
          applyShow(tileset, expression);
          appliedRef.current.set(tileset, expression ?? '');
        }
        applySection(tileset, filter.section);
      }
    }
  }, [models, filters]);

  const setFilter = useCallback(
    (modelId: string, change: Partial<ModelFilter>) =>
      setFilters((current) => ({
        ...current,
        [modelId]: { ...(current[modelId] ?? NO_FILTER), ...change },
      })),
    [],
  );

  return {
    /** The attributes a model's parts can be filtered by, floor first. */
    attributesOf: (modelId: string): FilterableAttribute[] => catalogue[modelId] ?? [],
    filterOf: (modelId: string): ModelFilter => filters[modelId] ?? NO_FILTER,
    setFilter,
  };
}

/** Shows only the parts `expression` picks out — or all of them, for `null`. */
function applyShow(tileset: Cesium.Cesium3DTileset, expression: string | null): void {
  tileset.style = expression ? new Cesium.Cesium3DTileStyle({ show: expression }) : undefined;
}

/**
 * Cuts a tileset at `height` — everything above removed — or uncuts it.
 *
 * One plane with its normal pointing down: Cesium keeps the side a plane's
 * normal points to, so (0, 0, -1) keeps what's below. It's in the tileset's
 * clipping frame — for a BIM model, the local frame its root transform sets
 * up on site, which also carries the app's on-terrain shift, so the cut
 * moves with the model. The collection is made once and switched off
 * rather than removed, since `clippingPlanes` can't be set back to empty.
 */
function applySection(tileset: Cesium.Cesium3DTileset, height: number | null): void {
  const planes: Cesium.ClippingPlaneCollection | undefined = tileset.clippingPlanes;
  if (height === null) {
    if (planes) planes.enabled = false;
    return;
  }
  if (!planes) {
    tileset.clippingPlanes = new Cesium.ClippingPlaneCollection({
      planes: [new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 0, -1), height)],
      // The cut face outlined in the accent: where the model was sliced.
      edgeColor: MAP_COLORS.accent,
      edgeWidth: 1.5,
    });
    return;
  }
  planes.get(0).distance = height;
  planes.enabled = true;
}
