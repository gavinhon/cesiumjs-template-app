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

const CATALOGUE_DELAY = 250;

function visitLoaded(tile: Cesium.Cesium3DTile, visit: (tile: Cesium.Cesium3DTile) => void): void {
  visit(tile);
  for (const child of tile.children) visitLoaded(child, visit);
}

export function useModelFilters(models: ManagedModel[]) {
  const [filters, setFilters] = useState<Record<string, ModelFilter>>({});
  const [catalogue, setCatalogue] = useState<Record<string, FilterableAttribute[]>>({});

  const seenRef = useRef(new Map<string, Map<string, Set<string>>>());
  const modelsRef = useRef(models);
  useLayoutEffect(() => {
    modelsRef.current = models;
  });

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
    attributesOf: (modelId: string): FilterableAttribute[] => catalogue[modelId] ?? [],
    filterOf: (modelId: string): ModelFilter => filters[modelId] ?? NO_FILTER,
    setFilter,
  };
}

function applyShow(tileset: Cesium.Cesium3DTileset, expression: string | null): void {
  tileset.style = expression ? new Cesium.Cesium3DTileStyle({ show: expression }) : undefined;
}

function applySection(tileset: Cesium.Cesium3DTileset, height: number | null): void {
  const planes: Cesium.ClippingPlaneCollection | undefined = tileset.clippingPlanes;
  if (height === null) {
    if (planes) planes.enabled = false;
    return;
  }
  if (!planes) {
    tileset.clippingPlanes = new Cesium.ClippingPlaneCollection({
      planes: [new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 0, -1), height)],
      edgeColor: MAP_COLORS.accent,
      edgeWidth: 1.5,
    });
    return;
  }
  planes.get(0).distance = height;
  planes.enabled = true;
}
