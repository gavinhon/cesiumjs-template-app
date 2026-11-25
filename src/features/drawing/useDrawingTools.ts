import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';
import { createMapLabelLayer, type MapLabelLayer } from '@/cesium/mapLabels';
import { cancelCameraInertia } from '@/cesium/cancelCameraInertia';
import { pickSurface } from '@/cesium/pickSurface';
import { createId } from '@/lib/createId';
import {
  ANALYSIS_KINDS,
  applyGeometry,
  casedDashMaterial,
  casedLineMaterial,
  colorFor,
  hiddenLineMaterial,
  secondaryLabelsFor,
  isReadoutKind,
  labelAnchorFor,
  labelTextFor,
  levelLineFor,
  recolorPart,
  styleFeature,
  partOf,
  tagPart,
  type EntityPart,
} from './drawnFeaturePresentation';
import type { DrawnFeature, DrawnFeatureKind, FeatureAttribute, LabelSource } from './drawingTypes';
import { computeLineOfSight } from './lineOfSight';
import {
  describeDirect,
  describeElevation,
  describeHorizontal,
  describePath,
  formatDistance,
  heightTriangleCorner,
  horizontalDiffers,
  levelPath,
  pointAlong,
} from './measurement';

export type DrawingTool =
  'none' | 'point' | 'line' | 'polygon' | 'label' | 'measure' | 'height' | 'line-of-sight';

export type PathTool = Extract<DrawingTool, 'line' | 'polygon' | 'measure'>;

export function isPathTool(tool: DrawingTool): tool is PathTool {
  return tool === 'line' || tool === 'polygon' || tool === 'measure';
}

export type TwoPointTool = Extract<DrawingTool, 'height' | 'line-of-sight'>;

export function isTwoPointTool(tool: DrawingTool): tool is TwoPointTool {
  return tool === 'height' || tool === 'line-of-sight';
}

type InProgressTool = PathTool | TwoPointTool;

const DRAW_COLOR = MAP_COLORS.accent;
const MEASURE_COLOR = MAP_COLORS.measure;
const SIGHT_COLOR = MAP_COLORS.sight;

function toolColor(tool: DrawingTool): Cesium.Color {
  return tool === 'none' ? DRAW_COLOR : colorFor(tool);
}

const MIN_TWO_POINT_DISTANCE = 0.5;

const ANALYSING = 'Analysing…';

const GHOST_DRAW_COLOR = DRAW_COLOR.withAlpha(0.45);
const GHOST_MEASURE_COLOR = MEASURE_COLOR.withAlpha(0.45);
const GHOST_SIGHT_COLOR = SIGHT_COLOR.withAlpha(0.45);
const DASHED_SIGHT = new Cesium.PolylineDashMaterialProperty({
  color: SIGHT_COLOR,
  dashLength: 10,
});
const DASHED_MEASURE = casedDashMaterial(MEASURE_COLOR);
const GHOST_OUTLINE_COLOR = Cesium.Color.WHITE.withAlpha(0.85);

// Own double-click detection: Cesium's LEFT_DOUBLE_CLICK needs <5 px, which real clicks miss.
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_PIXELS = 12;

const DEFAULT_NAME: Record<DrawnFeatureKind, string> = {
  point: 'Point',
  line: 'Line',
  polygon: 'Polygon',
  label: 'Label',
  measure: 'Measurement',
  height: 'Height',
  'line-of-sight': 'Line of sight',
};

function minimumVertices(tool: InProgressTool): number {
  return tool === 'polygon' ? 3 : 2;
}

function measurementFor(kind: DrawnFeatureKind, positions: Cesium.Cartesian3[]): string | null {
  switch (kind) {
    case 'point':
      return describeElevation(positions[0]);
    case 'measure':
      return describePath(positions);
    case 'height':
      return describeDirect([positions[0], positions[positions.length - 1]]);
    default:
      return null;
  }
}

export function useDrawingTools(viewer: Cesium.Viewer | null) {
  const [activeTool, setActiveToolState] = useState<DrawingTool>('none');

  const activeToolRef = useRef<DrawingTool>('none');
  const positionsRef = useRef<Cesium.Cartesian3[]>([]);
  const previewMousePosRef = useRef<Cesium.Cartesian3 | null>(null);
  const previewEntityRef = useRef<Cesium.Entity | null>(null);
  const outlineEntityRef = useRef<Cesium.Entity | null>(null);
  const ghostEntityRef = useRef<Cesium.Entity | null>(null);
  const vertexEntitiesRef = useRef<Cesium.Entity[]>([]);
  const previewExtrasRef = useRef<Cesium.Entity[]>([]);
  const labelLayerRef = useRef<MapLabelLayer | null>(null);
  const measureLabelIdRef = useRef<string | null>(null);
  const horizontalLabelIdRef = useRef<string | null>(null);

  const [features, setFeatures] = useState<DrawnFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const featuresRef = useRef<DrawnFeature[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    featuresRef.current = features;
    selectedIdRef.current = selectedId;
  });

  const featureLabelIdsRef = useRef<Map<string, string>>(new Map());
  const secondaryLabelIdsRef = useRef<Map<string, string[]>>(new Map());
  const handleEntitiesRef = useRef<Cesium.Entity[]>([]);
  const dragRef = useRef<{
    featureId: string;
    index: number;
    positions: Cesium.Cartesian3[];
  } | null>(null);
  const cancelInProgressRef = useRef<() => void>(() => {});
  const runAnalysisRef = useRef<
    (
      featureId: string,
      kind: DrawnFeatureKind,
      positions: Cesium.Cartesian3[],
      entities: Cesium.Entity[],
    ) => Promise<void>
  >(async () => {});
  const commitInProgressRef = useRef<() => void>(() => {});
  const undoLastVertexRef = useRef<() => void>(() => {});
  const inProgressToolRef = useRef<InProgressTool | null>(null);
  const analysisRunsRef = useRef<Map<string, number>>(new Map());
  const lastClickRef = useRef<{ time: number; position: Cesium.Cartesian2 } | null>(null);

  const setActiveTool = useCallback((tool: DrawingTool) => {
    activeToolRef.current = tool;
    setActiveToolState(tool);
  }, []);

  useEffect(() => {
    if (!viewer) return;
    const cesiumViewer = viewer;

    const labelLayer = createMapLabelLayer(cesiumViewer);
    labelLayerRef.current = labelLayer;
    const featureLabelIds = featureLabelIdsRef.current;
    const secondaryLabelIds = secondaryLabelIdsRef.current;

    function livePositions(): Cesium.Cartesian3[] {
      const placed = positionsRef.current;
      if (previewMousePosRef.current && placed.length > 0) {
        return [...placed, previewMousePosRef.current];
      }
      return placed;
    }

    function livePolygonOutline(): Cesium.Cartesian3[] {
      const live = livePositions();
      return live.length >= 3 ? [...live, live[0]] : live;
    }

    function addVertexMarker(position: Cesium.Cartesian3, color: Cesium.Color) {
      const marker = cesiumViewer.entities.add({
        position,
        point: {
          pixelSize: 8,
          color: Cesium.Color.WHITE,
          outlineColor: color,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      vertexEntitiesRef.current.push(marker);
    }

    function clearVertexMarkers() {
      for (const marker of vertexEntitiesRef.current) {
        cesiumViewer.entities.remove(marker);
      }
      vertexEntitiesRef.current = [];
    }

    function cancelInProgress() {
      removeLiveLabels();
      for (const ref of [previewEntityRef, outlineEntityRef]) {
        if (ref.current) {
          cesiumViewer.entities.remove(ref.current);
          ref.current = null;
        }
      }
      for (const extra of previewExtrasRef.current) {
        cesiumViewer.entities.remove(extra);
      }
      previewExtrasRef.current = [];
      clearVertexMarkers();
      positionsRef.current = [];
      inProgressToolRef.current = null;
      lastClickRef.current = null;
    }
    cancelInProgressRef.current = cancelInProgress;

    function addFeature(input: {
      kind: DrawnFeatureKind;
      positions: Cesium.Cartesian3[];
      entities: Cesium.Entity[];
      name?: string;
      labelSource?: LabelSource;
      measurement?: string | null;
    }): string {
      const id = createId();
      setFeatures((prev) => {
        const ordinal = prev.filter((feature) => feature.kind === input.kind).length + 1;
        return [
          ...prev,
          {
            id,
            kind: input.kind,
            name: input.name ?? `${DEFAULT_NAME[input.kind]} ${ordinal}`,
            attributes: [],
            labelSource: input.labelSource ?? 'none',
            visible: true,
            positions: input.positions,
            entities: input.entities,
            measurement: input.measurement ?? null,
          },
        ];
      });
      return id;
    }

    function addPointMarker(position: Cesium.Cartesian3) {
      const entity = cesiumViewer.entities.add({
        position,
        point: {
          pixelSize: 10,
          color: DRAW_COLOR,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      addFeature({
        kind: 'point',
        positions: [position],
        entities: [entity],
        measurement: measurementFor('point', [position]),
      });
    }

    function addLabel(position: Cesium.Cartesian3, text: string) {
      const entity = cesiumViewer.entities.add({
        position,
        point: {
          pixelSize: 6,
          color: DRAW_COLOR,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      addFeature({
        kind: 'label',
        positions: [position],
        entities: [entity],
        name: text,
        labelSource: 'name',
      });
    }

    function liveReadout(tool: InProgressTool, positions: Cesium.Cartesian3[]): string {
      const first = positions[0];
      const last = positions[positions.length - 1];
      switch (tool) {
        case 'measure':
          return describeDirect(positions);
        case 'height':
          return describeDirect([first, last]);
        case 'line-of-sight':
          return `→ ${formatDistance(Cesium.Cartesian3.distance(first, last))}`;
        case 'line':
        case 'polygon':
          return '';
        default: {
          const exhaustive: never = tool;
          throw new Error(`Unhandled tool: ${String(exhaustive)}`);
        }
      }
    }

    function updateMeasureLabel(positions: Cesium.Cartesian3[]) {
      const id = measureLabelIdRef.current;
      const tool = inProgressToolRef.current;
      if (!id || !tool || positions.length === 0) return;
      if (tool !== 'measure') {
        labelLayer.update(id, positions[positions.length - 1], liveReadout(tool, positions));
        return;
      }
      labelLayer.update(id, pointAlong(positions, 0.5), describeDirect(positions));
      const horizontal = horizontalLabelIdRef.current;
      if (!horizontalDiffers(positions)) {
        if (horizontal) labelLayer.remove(horizontal);
        horizontalLabelIdRef.current = null;
        return;
      }
      const anchor = pointAlong(levelPath(positions), 0.5);
      const text = describeHorizontal(positions);
      if (horizontal) labelLayer.update(horizontal, anchor, text);
      else horizontalLabelIdRef.current = labelLayer.add(anchor, text, 'readout');
    }

    function removeLiveLabels() {
      for (const ref of [measureLabelIdRef, horizontalLabelIdRef]) {
        if (ref.current) labelLayer.remove(ref.current);
        ref.current = null;
      }
    }

    function startPath(tool: PathTool) {
      inProgressToolRef.current = tool;
      const color = toolColor(tool);

      if (tool === 'polygon') {
        const fill = cesiumViewer.entities.add({
          polygon: {
            hierarchy: new Cesium.CallbackProperty(
              () => new Cesium.PolygonHierarchy(livePositions()),
              false,
            ),
            material: color.withAlpha(0.25),
            outline: false,
          },
        });
        const outline = tagPart(
          cesiumViewer.entities.add({
            polyline: {
              positions: new Cesium.CallbackProperty(livePolygonOutline, false),
              width: 2,
              material: color,
              clampToGround: true,
            },
          }),
          'outline',
        );
        previewEntityRef.current = fill;
        outlineEntityRef.current = outline;
      } else {
        const line = cesiumViewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(livePositions, false),
            width: tool === 'measure' ? 5 : 3,
            material: tool === 'measure' ? casedLineMaterial(color) : color,
            depthFailMaterial: hiddenLineMaterial(color),
          },
        });
        previewEntityRef.current = line;
      }

      if (tool === 'measure') {
        addPreviewLine(() => levelLineFor(livePositions()), DASHED_MEASURE, 2);
        measureLabelIdRef.current = labelLayer.add(
          positionsRef.current[0],
          describeDirect(positionsRef.current),
          'readout',
        );
      }
    }

    function finishPath(tool: PathTool) {
      const finalPositions = positionsRef.current;
      if (finalPositions.length < minimumVertices(tool)) {
        cancelInProgress();
        return;
      }

      const entity = previewEntityRef.current;
      if (entity?.polyline) {
        entity.polyline.positions = new Cesium.ConstantProperty(finalPositions);
      }
      if (entity?.polygon) {
        entity.polygon.hierarchy = new Cesium.ConstantProperty(
          new Cesium.PolygonHierarchy(finalPositions),
        );
      }
      const outline = outlineEntityRef.current;
      if (outline?.polyline) {
        outline.polyline.positions = new Cesium.ConstantProperty([
          ...finalPositions,
          finalPositions[0],
        ]);
      }
      clearVertexMarkers();
      removeLiveLabels();
      for (const extra of previewExtrasRef.current) cesiumViewer.entities.remove(extra);
      previewExtrasRef.current = [];

      const entities = [previewEntityRef.current, outlineEntityRef.current].filter(
        (entity): entity is Cesium.Entity => entity !== null,
      );
      if (tool === 'measure') {
        entities.push(
          tagPart(
            cesiumViewer.entities.add({
              polyline: { positions: levelLineFor(finalPositions) },
            }),
            'level',
            { dashed: true },
          ),
        );
      }
      addFeature({
        kind: tool,
        positions: finalPositions,
        entities,
        labelSource: tool === 'measure' ? 'measurement' : 'none',
        measurement: measurementFor(tool, finalPositions),
      });

      previewEntityRef.current = null;
      outlineEntityRef.current = null;
      positionsRef.current = [];
      inProgressToolRef.current = null;
      lastClickRef.current = null;
    }

    function commitInProgress() {
      const tool = inProgressToolRef.current;
      if (tool && isPathTool(tool) && positionsRef.current.length >= minimumVertices(tool)) {
        finishPath(tool);
      } else {
        cancelInProgress();
      }
    }
    commitInProgressRef.current = commitInProgress;

    function liveEnd(): Cesium.Cartesian3 {
      return previewMousePosRef.current ?? positionsRef.current[0];
    }

    function addPreviewLine(
      positions: () => Cesium.Cartesian3[],
      material: Cesium.MaterialProperty,
      width: number,
    ) {
      const entity = cesiumViewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(positions, false),
          width,
          material,
          depthFailMaterial: material,
        },
      });
      previewExtrasRef.current.push(entity);
    }

    function startTwoPoint(tool: TwoPointTool) {
      inProgressToolRef.current = tool;
      const start = () => positionsRef.current[0];

      switch (tool) {
        case 'height':
          addPreviewLine(() => [start(), liveEnd()], casedLineMaterial(MEASURE_COLOR), 5);
          break;
        case 'line-of-sight':
          addPreviewLine(() => [start(), liveEnd()], DASHED_SIGHT, 2);
          break;
        default: {
          const exhaustive: never = tool;
          throw new Error(`Unhandled tool: ${String(exhaustive)}`);
        }
      }

      measureLabelIdRef.current = labelLayer.add(
        start(),
        liveReadout(tool, [start(), liveEnd()]),
        'readout',
      );
    }

    function finishTwoPoint(tool: TwoPointTool, end: Cesium.Cartesian3) {
      const start = positionsRef.current[0];
      if (Cesium.Cartesian3.distance(start, end) < MIN_TWO_POINT_DISTANCE) return;
      cancelInProgress();
      const positions = [start, end];
      const add = (options: Cesium.Entity.ConstructorOptions) => cesiumViewer.entities.add(options);
      const pointStyle = {
        pixelSize: 10,
        color: toolColor(tool),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      };

      let entities: Cesium.Entity[];
      switch (tool) {
        case 'height': {
          const corner = heightTriangleCorner(start, end);
          entities = [
            tagPart(add({ polyline: { positions } }), 'shape'),
            tagPart(add({ polyline: { positions: [start, corner] } }), 'vertical', {
              dashed: true,
            }),
            tagPart(add({ polyline: { positions: [corner, end] } }), 'horizontal', {
              dashed: true,
            }),
          ];
          break;
        }
        case 'line-of-sight': {
          const eye = start;
          entities = [
            tagPart(add({ polyline: { positions: [eye, end] } }), 'clear'),
            tagPart(add({ polyline: { positions: [] } }), 'blocked', {
              color: MAP_COLORS.obstructed,
            }),
            tagPart(add({ point: { ...pointStyle } }), 'obstruction', {
              color: MAP_COLORS.obstructed,
            }),
            tagPart(add({ position: eye, point: { ...pointStyle } }), 'eye'),
            tagPart(add({ position: end, point: { ...pointStyle } }), 'target'),
          ];
          break;
        }
        default: {
          const exhaustive: never = tool;
          throw new Error(`Unhandled tool: ${String(exhaustive)}`);
        }
      }

      const isAnalysis = ANALYSIS_KINDS.has(tool);
      const id = addFeature({
        kind: tool,
        positions,
        entities,
        labelSource: 'measurement',
        measurement: isAnalysis ? ANALYSING : measurementFor(tool, positions),
      });
      if (isAnalysis) void runAnalysis(id, tool, positions, entities);
    }

    async function runAnalysis(
      featureId: string,
      kind: DrawnFeatureKind,
      positions: Cesium.Cartesian3[],
      entities: Cesium.Entity[],
    ) {
      const run = (analysisRunsRef.current.get(featureId) ?? 0) + 1;
      analysisRunsRef.current.set(featureId, run);
      const isCurrent = () =>
        analysisRunsRef.current.get(featureId) === run && !cesiumViewer.isDestroyed();
      const start = positions[0];
      const end = positions[positions.length - 1];
      const part = (name: EntityPart) => entities.find((entity) => partOf(entity) === name);

      let measurement: string;
      try {
        if (kind === 'line-of-sight') {
          const { eye, target, obstruction } = await computeLineOfSight(
            cesiumViewer,
            start,
            end,
            cesiumViewer.entities.values,
          );
          if (!isCurrent()) return;
          const clear = part('clear');
          const blocked = part('blocked');
          const marker = part('obstruction');
          const targetMarker = part('target');
          if (clear?.polyline) {
            clear.polyline.positions = new Cesium.ConstantProperty([eye, obstruction ?? target]);
          }
          if (blocked?.polyline) {
            blocked.polyline.positions = new Cesium.ConstantProperty(
              obstruction ? [obstruction, target] : [],
            );
          }
          if (marker) {
            marker.position = obstruction
              ? new Cesium.ConstantPositionProperty(obstruction)
              : undefined;
          }
          if (targetMarker) {
            recolorPart(targetMarker, obstruction ? MAP_COLORS.obstructed : SIGHT_COLOR);
          }
          const total = formatDistance(Cesium.Cartesian3.distance(eye, target));
          measurement = obstruction
            ? `Blocked at ${formatDistance(Cesium.Cartesian3.distance(eye, obstruction))} of ${total}`
            : `Visible · ${total}`;
        } else {
          return;
        }
      } catch (error) {
        if (!isCurrent()) return;
        measurement = `Analysis failed: ${error instanceof Error ? error.message : String(error)}`;
      }

      if (!featuresRef.current.some((feature) => feature.id === featureId)) return;

      setFeatures((prev) =>
        prev.map((feature) => (feature.id === featureId ? { ...feature, measurement } : feature)),
      );
    }
    runAnalysisRef.current = runAnalysis;

    function undoLastVertex() {
      if (positionsRef.current.length === 0) return;
      positionsRef.current = positionsRef.current.slice(0, -1);
      const marker = vertexEntitiesRef.current.pop();
      if (marker) cesiumViewer.entities.remove(marker);

      if (positionsRef.current.length === 0) {
        cancelInProgress();
      } else if (measureLabelIdRef.current) {
        updateMeasureLabel(livePositions());
      }
    }
    undoLastVertexRef.current = undoLastVertex;

    const ghost = cesiumViewer.entities.add({
      position: new Cesium.CallbackPositionProperty(
        () => previewMousePosRef.current ?? undefined,
        false,
      ),
      point: {
        pixelSize: 13,
        color: new Cesium.CallbackProperty(() => {
          const color = toolColor(activeToolRef.current);
          if (color === MEASURE_COLOR) return GHOST_MEASURE_COLOR;
          if (color === SIGHT_COLOR) return GHOST_SIGHT_COLOR;
          return GHOST_DRAW_COLOR;
        }, false),
        outlineColor: GHOST_OUTLINE_COLOR,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: new Cesium.CallbackProperty(
          () => activeToolRef.current !== 'none' && previewMousePosRef.current !== null,
          false,
        ),
      },
    });
    ghostEntityRef.current = ghost;

    function pickEntity(screenPosition: Cesium.Cartesian2): Cesium.Entity | null {
      const picked: unknown = cesiumViewer.scene.pick(screenPosition);
      if (picked && typeof picked === 'object' && 'id' in picked) {
        const id = (picked as { id: unknown }).id;
        if (id instanceof Cesium.Entity) return id;
      }
      return null;
    }

    function featureOwning(entity: Cesium.Entity | null): DrawnFeature | null {
      if (!entity) return null;
      return featuresRef.current.find((feature) => feature.entities.includes(entity)) ?? null;
    }

    function refreshDragLabel(feature: DrawnFeature, positions: Cesium.Cartesian3[]) {
      const labelId = featureLabelIdsRef.current.get(feature.id);
      if (!labelId) return;
      const moved: DrawnFeature = {
        ...feature,
        positions,
        measurement: measurementFor(feature.kind, positions) ?? feature.measurement,
      };
      const text = labelTextFor(moved);
      if (text !== null) labelLayer.update(labelId, labelAnchorFor(moved), text);
      const secondaryIds = secondaryLabelIdsRef.current.get(feature.id) ?? [];
      const secondary = secondaryLabelsFor(moved, feature.id === selectedIdRef.current);
      secondaryIds.forEach((id, i) => {
        if (secondary[i]) labelLayer.update(id, secondary[i].anchor, secondary[i].text);
      });
    }

    const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const tool = activeToolRef.current;

      if (tool === 'none') {
        const pickedEntity = pickEntity(event.position);
        if (pickedEntity && handleEntitiesRef.current.includes(pickedEntity)) return;
        setSelectedId(featureOwning(pickedEntity)?.id ?? null);
        return;
      }

      const point = pickSurface(cesiumViewer, event.position);
      if (!point) return;

      if (tool === 'point') {
        addPointMarker(point);
        return;
      }
      if (tool === 'label') {
        const text = window.prompt('Label text:');
        if (text) addLabel(point, text);
        return;
      }

      if (isTwoPointTool(tool)) {
        if (positionsRef.current.length === 0) {
          positionsRef.current = [point];
          addVertexMarker(point, toolColor(tool));
          startTwoPoint(tool);
        } else {
          finishTwoPoint(tool, point);
        }
        return;
      }

      const positions = positionsRef.current;

      const lastClick = lastClickRef.current;
      const endsPath =
        lastClick !== null &&
        performance.now() - lastClick.time < DOUBLE_CLICK_MS &&
        Cesium.Cartesian2.distance(event.position, lastClick.position) < DOUBLE_CLICK_PIXELS;

      if (endsPath && positions.length >= minimumVertices(tool)) {
        finishPath(tool);
        return;
      }
      lastClickRef.current = {
        time: performance.now(),
        position: Cesium.Cartesian2.clone(event.position),
      };

      const isFirstPoint = positions.length === 0;
      positionsRef.current = [...positions, point];
      addVertexMarker(point, toolColor(tool));
      if (isFirstPoint) {
        startPath(tool);
      } else {
        updateMeasureLabel(livePositions());
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (activeToolRef.current !== 'none') return;
      const pickedEntity = pickEntity(event.position);
      if (!pickedEntity) return;
      const index = handleEntitiesRef.current.indexOf(pickedEntity);
      if (index === -1) return;
      const feature = featuresRef.current.find((entry) => entry.id === selectedIdRef.current);
      if (!feature) return;

      dragRef.current = { featureId: feature.id, index, positions: [...feature.positions] };
      cesiumViewer.scene.screenSpaceCameraController.enableInputs = false;
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction(() => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      cesiumViewer.scene.screenSpaceCameraController.enableInputs = true;
      // Else Cesium replays the ignored drag as spin inertia.
      cancelCameraInertia(cesiumViewer.scene);

      const dragged = featuresRef.current.find((feature) => feature.id === drag.featureId);
      const isAnalysis = dragged !== undefined && ANALYSIS_KINDS.has(dragged.kind);
      setFeatures((prev) =>
        prev.map((feature) =>
          feature.id === drag.featureId
            ? {
                ...feature,
                positions: drag.positions,
                measurement: isAnalysis
                  ? ANALYSING
                  : (measurementFor(feature.kind, drag.positions) ?? feature.measurement),
              }
            : feature,
        ),
      );
      if (dragged && isAnalysis) {
        void runAnalysisRef.current(dragged.id, dragged.kind, drag.positions, dragged.entities);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const dragged = pickSurface(cesiumViewer, event.endPosition);
        const feature = featuresRef.current.find((entry) => entry.id === drag.featureId);
        if (!dragged || !feature) return;
        drag.positions[drag.index] = dragged;
        applyGeometry(feature, drag.positions);
        handleEntitiesRef.current[drag.index].position = new Cesium.ConstantPositionProperty(
          dragged,
        );
        refreshDragLabel(feature, drag.positions);
        return;
      }

      const tool = activeToolRef.current;
      if (tool === 'none') return;
      previewMousePosRef.current = pickSurface(cesiumViewer, event.endPosition);
      if (positionsRef.current.length > 0) {
        updateMeasureLabel(
          isTwoPointTool(tool) ? [positionsRef.current[0], liveEnd()] : livePositions(),
        );
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    function onKeyDown(event: KeyboardEvent) {
      if (activeToolRef.current === 'none') return;

      if (event.key === 'Escape') {
        if (positionsRef.current.length > 0) {
          cancelInProgress();
        } else {
          setActiveTool('none');
        }
        return;
      }

      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isTyping || positionsRef.current.length === 0) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        commitInProgress();
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        undoLastVertex();
      }
    }
    window.addEventListener('keydown', onKeyDown);

    const canvas = cesiumViewer.scene.canvas;
    function onPointerLeave() {
      previewMousePosRef.current = null;
    }
    canvas.addEventListener('pointerleave', onPointerLeave);

    return () => {
      handler.destroy();
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      if (ghostEntityRef.current) {
        cesiumViewer.entities.remove(ghostEntityRef.current);
        ghostEntityRef.current = null;
      }
      labelLayer.destroy();
      labelLayerRef.current = null;
      featureLabelIds.clear();
      secondaryLabelIds.clear();
    };
  }, [viewer, setActiveTool]);

  useEffect(() => {
    commitInProgressRef.current();
  }, [activeTool]);

  const selectedFeature = features.find((feature) => feature.id === selectedId) ?? null;

  useEffect(() => {
    for (const feature of features) {
      styleFeature(feature, feature.id === selectedId);
    }
  }, [features, selectedId]);

  useEffect(() => {
    const labelLayer = labelLayerRef.current;
    if (!labelLayer) return;
    const labelIds = featureLabelIdsRef.current;

    const live = new Set<string>();
    for (const feature of features) {
      live.add(feature.id);
      const text = labelTextFor(feature);
      const existing = labelIds.get(feature.id);

      if (text === null) {
        if (existing) {
          labelLayer.remove(existing);
          labelIds.delete(feature.id);
        }
        continue;
      }
      const anchor = labelAnchorFor(feature);
      if (existing) {
        labelLayer.update(existing, anchor, text);
      } else {
        labelIds.set(
          feature.id,
          labelLayer.add(anchor, text, isReadoutKind(feature.kind) ? 'readout' : 'text'),
        );
      }
    }

    for (const [featureId, labelId] of labelIds) {
      if (!live.has(featureId)) {
        labelLayer.remove(labelId);
        labelIds.delete(featureId);
      }
    }

    const secondaryIds = secondaryLabelIdsRef.current;
    for (const ids of secondaryIds.values()) for (const id of ids) labelLayer.remove(id);
    secondaryIds.clear();
    for (const feature of features) {
      const labels = secondaryLabelsFor(feature, feature.id === selectedId);
      if (labels.length === 0) continue;
      secondaryIds.set(
        feature.id,
        labels.map((label) => labelLayer.add(label.anchor, label.text, 'readout')),
      );
    }
  }, [features, selectedId]);

  useEffect(() => {
    if (!viewer || !selectedFeature || !selectedFeature.visible) return;

    const handles = selectedFeature.positions.map((position) =>
      viewer.entities.add({
        position,
        point: {
          pixelSize: 11,
          color: Cesium.Color.WHITE,
          outlineColor: colorFor(selectedFeature.kind),
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );
    handleEntitiesRef.current = handles;

    return () => {
      for (const handle of handles) {
        viewer.entities.remove(handle);
      }
      handleEntitiesRef.current = [];
    };
  }, [viewer, selectedFeature]);

  const updateFeature = useCallback(
    (id: string, change: (feature: DrawnFeature) => DrawnFeature) => {
      setFeatures((prev) => prev.map((feature) => (feature.id === id ? change(feature) : feature)));
    },
    [],
  );

  const selectFeature = useCallback((id: string | null) => setSelectedId(id), []);

  const renameFeature = useCallback(
    (id: string, name: string) => updateFeature(id, (feature) => ({ ...feature, name })),
    [updateFeature],
  );

  const setLabelSource = useCallback(
    (id: string, labelSource: LabelSource) =>
      updateFeature(id, (feature) => ({ ...feature, labelSource })),
    [updateFeature],
  );

  const toggleFeatureVisibility = useCallback(
    (id: string) => updateFeature(id, (feature) => ({ ...feature, visible: !feature.visible })),
    [updateFeature],
  );

  const addAttribute = useCallback(
    (id: string) => {
      const attributeId = createId();
      updateFeature(id, (feature) => ({
        ...feature,
        attributes: [...feature.attributes, { id: attributeId, key: '', value: '' }],
      }));
    },
    [updateFeature],
  );

  const updateAttribute = useCallback(
    (id: string, attributeId: string, patch: Partial<Omit<FeatureAttribute, 'id'>>) =>
      updateFeature(id, (feature) => ({
        ...feature,
        attributes: feature.attributes.map((attribute) =>
          attribute.id === attributeId ? { ...attribute, ...patch } : attribute,
        ),
      })),
    [updateFeature],
  );

  const removeAttribute = useCallback(
    (id: string, attributeId: string) =>
      updateFeature(id, (feature) => ({
        ...feature,
        attributes: feature.attributes.filter((attribute) => attribute.id !== attributeId),
        labelSource: feature.labelSource === attributeId ? 'none' : feature.labelSource,
      })),
    [updateFeature],
  );

  const removeFeature = useCallback(
    (id: string) => {
      if (!viewer) return;
      const feature = featuresRef.current.find((entry) => entry.id === id);
      if (feature) {
        for (const entity of feature.entities) {
          viewer.entities.remove(entity);
        }
      }
      setFeatures((prev) => prev.filter((entry) => entry.id !== id));
      setSelectedId((current) => (current === id ? null : current));
    },
    [viewer],
  );

  const zoomToFeature = useCallback(
    (id: string) => {
      if (!viewer) return;
      const feature = featuresRef.current.find((entry) => entry.id === id);
      if (!feature) return;
      viewer.flyTo(feature.entities).catch(() => {});
    },
    [viewer],
  );

  useEffect(() => {
    if (!viewer) return;
    const canvas = viewer.scene.canvas;
    canvas.style.setProperty('cursor', activeTool === 'none' ? '' : 'crosshair');
    return () => {
      canvas.style.removeProperty('cursor');
    };
  }, [viewer, activeTool]);

  const clearAll = useCallback(() => {
    if (!viewer) return;
    cancelInProgressRef.current();
    for (const feature of featuresRef.current) {
      for (const entity of feature.entities) {
        viewer.entities.remove(entity);
      }
    }
    const labelLayer = labelLayerRef.current;
    for (const labelId of featureLabelIdsRef.current.values()) labelLayer?.remove(labelId);
    featureLabelIdsRef.current.clear();
    for (const ids of secondaryLabelIdsRef.current.values()) {
      for (const labelId of ids) labelLayer?.remove(labelId);
    }
    secondaryLabelIdsRef.current.clear();
    setFeatures([]);
    setSelectedId(null);
  }, [viewer]);

  const finishInProgress = useCallback(() => commitInProgressRef.current(), []);

  const undoInProgress = useCallback(() => undoLastVertexRef.current(), []);

  return {
    activeTool,
    setActiveTool,
    finishInProgress,
    undoInProgress,
    clearAll,
    features,
    selectedId,
    selectedFeature,
    selectFeature,
    renameFeature,
    setLabelSource,
    toggleFeatureVisibility,
    addAttribute,
    updateAttribute,
    removeAttribute,
    removeFeature,
    zoomToFeature,
  };
}
