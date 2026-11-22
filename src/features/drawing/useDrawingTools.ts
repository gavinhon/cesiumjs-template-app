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
  horizontalLabelFor,
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
import { computeLineOfSight, EYE_HEIGHT, raise } from './lineOfSight';
import {
  describeDirect,
  describeElevation,
  describeHeight,
  describeHorizontal,
  describePath,
  formatDistance,
  heightTriangleCorner,
  horizontalDiffers,
  levelPath,
  pointAlong,
} from './measurement';
import { computeViewshed, describeViewshed, rimPositions } from './viewshed';

/** Which drawing/measurement/analysis mode is currently active, if any. */
export type DrawingTool =
  | 'none'
  | 'point'
  | 'line'
  | 'polygon'
  | 'label'
  | 'measure'
  | 'height'
  | 'line-of-sight'
  | 'viewshed';

/** The tools that build a multi-vertex path, rather than placing one thing per click. */
export type PathTool = Extract<DrawingTool, 'line' | 'polygon' | 'measure'>;

export function isPathTool(tool: DrawingTool): tool is PathTool {
  return tool === 'line' || tool === 'polygon' || tool === 'measure';
}

/**
 * The tools defined by exactly two clicks — a start and an end — which
 * finish on the second click instead of waiting for a double-click: there
 * is nothing a third point could mean.
 */
export type TwoPointTool = Extract<DrawingTool, 'height' | 'line-of-sight' | 'viewshed'>;

export function isTwoPointTool(tool: DrawingTool): tool is TwoPointTool {
  return tool === 'height' || tool === 'line-of-sight' || tool === 'viewshed';
}

/** Whatever tool owns the shape currently being drawn. */
type InProgressTool = PathTool | TwoPointTool;

// Cesium draws into WebGL, not the DOM, so it can't read the CSS custom
// properties in src/styles/designTokens.css. The mirrored values live in
// src/cesium/mapColors.ts — don't reintroduce local copies here.
const DRAW_COLOR = MAP_COLORS.accent;
const MEASURE_COLOR = MAP_COLORS.measure;
const SIGHT_COLOR = MAP_COLORS.sight;

/** A tool draws in the colour of the feature kind it makes — see `colorFor`. */
function toolColor(tool: DrawingTool): Cesium.Color {
  return tool === 'none' ? DRAW_COLOR : colorFor(tool);
}

/**
 * Two clicks closer than this are a slip, not a measurement: a viewshed
 * with no radius, or a sight line to the observer's own feet.
 */
const MIN_TWO_POINT_DISTANCE = 0.5;

/** Shown while a line-of-sight or viewshed analysis is running. */
const ANALYSING = 'Analysing…';

/**
 * Translucent tool colours for the marker that follows the cursor.
 *
 * Precomputed rather than built with `withAlpha` inside the render
 * callback: that callback is evaluated once per frame, and allocating a
 * `Color` sixty times a second to express the same constant is pure
 * garbage-collector pressure for no benefit.
 */
const GHOST_DRAW_COLOR = DRAW_COLOR.withAlpha(0.45);
const GHOST_MEASURE_COLOR = MEASURE_COLOR.withAlpha(0.45);
const GHOST_SIGHT_COLOR = SIGHT_COLOR.withAlpha(0.45);
/** The dashed construction lines previewing a two-point tool. */
const DASHED_SIGHT = new Cesium.PolylineDashMaterialProperty({
  color: SIGHT_COLOR,
  dashLength: 10,
});
const DASHED_MEASURE = casedDashMaterial(MEASURE_COLOR);
const GHOST_OUTLINE_COLOR = Cesium.Color.WHITE.withAlpha(0.85);

/**
 * How forgiving "double-click to finish" is.
 *
 * Cesium's own `LEFT_DOUBLE_CLICK` only fires when the two clicks land
 * within 5 pixels of each other — a tolerance a real hand misses
 * constantly, especially on a trackpad. When it doesn't fire, both clicks
 * still arrive as `LEFT_CLICK`, so the path silently keeps growing: the
 * shape never finishes, the next one merges into it, and switching tools
 * throws the lot away. Detecting the gesture here, at a distance people can
 * actually hit, is the fix.
 */
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_PIXELS = 12;

/** What a new feature of each kind is called before the user renames it. */
const DEFAULT_NAME: Record<DrawnFeatureKind, string> = {
  point: 'Point',
  line: 'Line',
  polygon: 'Polygon',
  label: 'Label',
  measure: 'Measurement',
  height: 'Height',
  'line-of-sight': 'Line of sight',
  viewshed: 'Viewshed',
};

/** Fewest vertices that make a real shape — below this there's nothing to keep. */
function minimumVertices(tool: InProgressTool): number {
  return tool === 'polygon' ? 3 : 2;
}

/**
 * The readout a feature carries, for the kinds whose readout is pure
 * geometry. `null` for everything else — including the analyses, whose
 * readout needs the terrain and is computed asynchronously by `runAnalysis`.
 */
function measurementFor(kind: DrawnFeatureKind, positions: Cesium.Cartesian3[]): string | null {
  switch (kind) {
    case 'point':
      return describeElevation(positions[0]);
    case 'measure':
      return describePath(positions);
    case 'height':
      return describeHeight(positions[0], positions[positions.length - 1]);
    default:
      return null;
  }
}

/**
 * Lets the user draw points, lines, and polygons on the map, measure
 * distances and heights in 3D, analyse line of sight and viewsheds, and
 * drop text labels — all via Cesium's
 * `Entity` API (`viewer.entities`). That choice is what makes "works in
 * both 2D and 3D" close to free: entities are scene-mode-aware by design,
 * unlike lower-level `Primitive`s, which would need separate handling per
 * mode. Nothing here is persisted — reloading the page clears every
 * drawing, by design.
 *
 * Everything the user sees before committing a click is *preview* state:
 * a marker on the cursor, the rubber-band edge running to it, and a dot on
 * each vertex placed so far. Previews are tracked by their own refs and
 * torn down when the shape completes.
 *
 * A finished shape becomes a `DrawnFeature` (see ./drawingTypes.ts) — a record
 * that can be selected, named, given attributes, labelled and reshaped
 * afterwards, rather than an anonymous entity on the globe. That list is
 * React state; only the in-progress preview lives in refs.
 */
export function useDrawingTools(viewer: Cesium.Viewer | null) {
  const [activeTool, setActiveToolState] = useState<DrawingTool>('none');

  // Refs, not state: this data drives a per-frame Cesium render callback,
  // not a React re-render, so it belongs outside React's state system —
  // same reasoning as `viewerRef` in CesiumMap.tsx.
  const activeToolRef = useRef<DrawingTool>('none');
  const positionsRef = useRef<Cesium.Cartesian3[]>([]);
  const previewMousePosRef = useRef<Cesium.Cartesian3 | null>(null);
  const previewEntityRef = useRef<Cesium.Entity | null>(null);
  const outlineEntityRef = useRef<Cesium.Entity | null>(null);
  const ghostEntityRef = useRef<Cesium.Entity | null>(null);
  const vertexEntitiesRef = useRef<Cesium.Entity[]>([]);
  // The construction lines a two-point tool previews with — a height
  // triangle's legs, a viewshed's rim. Torn down when the second click lands.
  const previewExtrasRef = useRef<Cesium.Entity[]>([]);
  const labelLayerRef = useRef<MapLabelLayer | null>(null);
  // The in-progress measurement readout. Finished features get their labels
  // from the sync effect further down instead.
  const measureLabelIdRef = useRef<string | null>(null);
  // The measure tool's second live label, on its dotted level line. Exists
  // only while the path climbs enough for the horizontal distance to differ.
  const horizontalLabelIdRef = useRef<string | null>(null);

  /**
   * Everything that has been drawn, and which one is selected.
   *
   * State rather than refs: this is what the drawings panel renders, and it
   * only changes at input rate. The refs beside it are read by the Cesium
   * input handlers, which are created once and would otherwise close over
   * the first render's values forever.
   */
  const [features, setFeatures] = useState<DrawnFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const featuresRef = useRef<DrawnFeature[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  // Kept current in a layout effect, not by assigning during render: React
  // may render without committing (StrictMode, concurrent rendering), and a
  // render-time write would leak a value that never reached the screen. A
  // layout effect runs right after commit, before any input event can.
  useLayoutEffect(() => {
    featuresRef.current = features;
    selectedIdRef.current = selectedId;
  });

  /** Label ids per feature, keyed by feature id — see the label sync effect. */
  const featureLabelIdsRef = useRef<Map<string, string>>(new Map());
  /** A measurement's second label, on its level line — see `horizontalLabelFor`. */
  const horizontalLabelIdsRef = useRef<Map<string, string>>(new Map());
  /** Draggable vertex handles for the selected feature, in vertex order. */
  const handleEntitiesRef = useRef<Cesium.Entity[]>([]);
  const dragRef = useRef<{
    featureId: string;
    index: number;
    positions: Cesium.Cartesian3[];
  } | null>(null);
  const cancelInProgressRef = useRef<() => void>(() => {});
  // Re-runs an analysis after its vertices are dragged. Lives in the input
  // effect, which owns the label layer and entity bookkeeping it needs.
  const runAnalysisRef = useRef<
    (
      featureId: string,
      kind: DrawnFeatureKind,
      positions: Cesium.Cartesian3[],
      entities: Cesium.Entity[],
    ) => Promise<void>
  >(async () => {});
  const commitInProgressRef = useRef<() => void>(() => {});
  // The keyboard's Enter and Backspace, for the on-screen buttons a touch
  // screen gets instead. Set inside the handler effect, like the one above.
  const undoLastVertexRef = useRef<() => void>(() => {});
  // Which tool owns the shape being drawn. Needed because committing happens
  // *after* `activeTool` has already changed to the tool being switched to.
  const inProgressToolRef = useRef<InProgressTool | null>(null);
  // The latest analysis run per feature. A drag can start a new analysis
  // before the last one finishes; only the newest may write its result.
  const analysisRunsRef = useRef<Map<string, number>>(new Map());
  const lastClickRef = useRef<{ time: number; position: Cesium.Cartesian2 } | null>(null);

  const setActiveTool = useCallback((tool: DrawingTool) => {
    activeToolRef.current = tool;
    setActiveToolState(tool);
  }, []);

  useEffect(() => {
    if (!viewer) return;
    // A `const` alias so the narrowed (non-null) type holds inside the
    // nested functions below — TypeScript doesn't carry a `let`/parameter
    // narrowing into closures, only `const` bindings.
    const cesiumViewer = viewer;

    // HTML labels rather than Cesium's own — see src/cesium/mapLabels.ts
    // for why. Created and torn down with this effect, like the input
    // handler below.
    const labelLayer = createMapLabelLayer(cesiumViewer);
    labelLayerRef.current = labelLayer;
    // The label-id maps die with this layer. Captured here so the cleanup
    // clears these maps — the refs hold the same objects for the hook's
    // whole life, but reading `.current` in a cleanup is a lint error for
    // good reason in general.
    const featureLabelIds = featureLabelIdsRef.current;
    const horizontalLabelIds = horizontalLabelIdsRef.current;

    // Every click and cursor move below becomes a position through
    // `pickSurface` — on the terrain, or on a 3D Tiles building standing on
    // it. That's what makes every tool here 3D: a vertex lands on the
    // rooftop or hillside you clicked, so distances and heights between
    // vertices are real 3D measurements.

    // The vertices placed so far, plus — while the next click hasn't
    // happened yet — a trailing point that follows the cursor. That's the
    // classic "rubber band" preview effect for a line/polygon in progress.
    function livePositions(): Cesium.Cartesian3[] {
      const placed = positionsRef.current;
      if (previewMousePosRef.current && placed.length > 0) {
        return [...placed, previewMousePosRef.current];
      }
      return placed;
    }

    /**
     * The edges to stroke while a polygon is in progress.
     *
     * The ring only closes back to the first vertex once there are three
     * points: with two, a "closing" edge would just retrace the segment
     * already there, drawing it twice at double opacity.
     */
    function livePolygonOutline(): Cesium.Cartesian3[] {
      const live = livePositions();
      return live.length >= 3 ? [...live, live[0]] : live;
    }

    /**
     * Adds a dot marking a vertex already placed in the current path.
     *
     * Scaffolding, not part of the result: the finished line or polygon
     * speaks for itself, and a dot left on every vertex would clutter a
     * shape drawn with many points. Filled white with a coloured ring, so
     * they read as *handles* rather than as points placed with the point
     * tool, which are styled the other way round.
     */
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
      // `previewMousePosRef` deliberately survives: it records where the
      // cursor is, which is input state rather than part of the shape.
      // Clearing it here would blink the cursor marker out on every tool
      // switch until the pointer happened to move again.
    }
    cancelInProgressRef.current = cancelInProgress;

    /**
     * Promotes finished geometry into a `DrawnFeature` — the record that
     * makes a shape selectable, nameable and editable rather than an
     * anonymous entity on the globe.
     *
     * The id is minted outside the state updater on purpose: StrictMode
     * double-invokes updaters in development, and an id generated inside one
     * would differ between the two runs. The *name* is computed inside,
     * where the current list is available, and is a pure function of it.
     */
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

    // The anchor dot stays a Cesium entity — it's a mark on the globe and
    // should behave like one — while the text becomes an HTML label.
    function addLabel(position: Cesium.Cartesian3, text: string) {
      const entity = cesiumViewer.entities.add({
        position,
        point: {
          pixelSize: 6,
          color: DRAW_COLOR,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      // The text becomes the feature's *name*, shown by pointing its label
      // at the name. That makes it editable in the panel afterwards, which a
      // label baked into the overlay at creation time would not be.
      addFeature({
        kind: 'label',
        positions: [position],
        entities: [entity],
        name: text,
        labelSource: 'name',
      });
    }

    /**
     * What the live readout says while a tool is mid-shape, given the
     * vertices so far plus the cursor. Analyses can't be computed live —
     * they query the terrain — so theirs describe the geometry instead.
     */
    function liveReadout(tool: InProgressTool, positions: Cesium.Cartesian3[]): string {
      const first = positions[0];
      const last = positions[positions.length - 1];
      switch (tool) {
        case 'measure':
          return describeDirect(positions);
        case 'height':
          return describeHeight(first, last);
        case 'line-of-sight':
          return `→ ${formatDistance(Cesium.Cartesian3.distance(first, last))}`;
        case 'viewshed':
          return `r ${formatDistance(Cesium.Cartesian3.distance(first, last))}`;
        case 'line':
        case 'polygon':
          return '';
        default: {
          const exhaustive: never = tool;
          throw new Error(`Unhandled tool: ${String(exhaustive)}`);
        }
      }
    }

    // Keeps the running readout in sync with the current vertices.
    //
    // This used to carry a long warning about never driving a Cesium
    // `Label` from a `CallbackProperty`: doing so re-rasterises the glyph
    // texture every frame and visibly corrupts the text. An HTML label has
    // no such trap — the browser handles text — so this is now just a
    // straightforward update, called from the same input events as before.
    function updateMeasureLabel(positions: Cesium.Cartesian3[]) {
      const id = measureLabelIdRef.current;
      const tool = inProgressToolRef.current;
      if (!id || !tool || positions.length === 0) return;
      if (tool !== 'measure') {
        labelLayer.update(id, positions[positions.length - 1], liveReadout(tool, positions));
        return;
      }
      // A measurement labels each line it draws, halfway along it, exactly
      // as the finished feature will: the 3D length on the measured line,
      // the horizontal distance on the dotted level line below it.
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

    /** Takes down the in-progress readouts. Finished features get theirs from the sync effect. */
    function removeLiveLabels() {
      for (const ref of [measureLabelIdRef, horizontalLabelIdRef]) {
        if (ref.current) labelLayer.remove(ref.current);
        ref.current = null;
      }
    }

    // First click of a line/polygon/measurement: create the entity that
    // will track every vertex from here on. The polyline/polygon shape
    // uses a CallbackProperty (see updateMeasureLabel above for why the
    // label doesn't) so it redraws every frame without us manually pushing
    // updates to it on mouse move — we just keep the refs it reads from current.
    function startPath(tool: PathTool) {
      inProgressToolRef.current = tool;
      const color = toolColor(tool);

      if (tool === 'polygon') {
        // Two entities, not one, for two separate reasons.
        //
        // A `PolygonHierarchy` needs three vertices before it encloses any
        // area, so a polygon-only preview draws *nothing at all* between
        // the first and second click — you click once and the map looks
        // like it ignored you. The polyline shows the edge running from
        // the first vertex to the cursor immediately.
        //
        // It then stays on as the finished outline, because
        // `polygon.outline` can't do that job: WebGL caps hardware line
        // width at 1px on most platforms, so `outlineWidth` is silently
        // ignored there and the edge renders hairline-thin or not at all.
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
              depthFailMaterial: hiddenLineMaterial(color),
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
        // The dotted level line: the path flattened to its lowest point, so
        // "horizontal" has a line of its own to be measured along. Empty —
        // drawn as nothing — while the path is too flat for it to differ.
        addPreviewLine(() => levelLineFor(livePositions()), DASHED_MEASURE, 2);
        measureLabelIdRef.current = labelLayer.add(
          positionsRef.current[0],
          describeDirect(positionsRef.current),
          'readout',
        );
      }
    }

    /**
     * Commits the path being drawn.
     *
     * Takes the vertices exactly as placed. The click that ends a path
     * never becomes a vertex itself — the double-click gesture is caught in
     * the click handler before the vertex is added, and Enter adds nothing
     * — so there is no trailing duplicate to trim here.
     */
    function finishPath(tool: PathTool) {
      const finalPositions = positionsRef.current;
      if (finalPositions.length < minimumVertices(tool)) {
        cancelInProgress();
        return;
      }

      // Freeze the shape at its final positions — swapping the live
      // CallbackProperty for a plain ConstantProperty — so it stops
      // following the cursor once the drawing is done.
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
        // Close the ring explicitly. The live callback only closed it while
        // there were enough vertices to enclose something, and this is the
        // last chance to say what the finished shape actually is.
        outline.polyline.positions = new Cesium.ConstantProperty([
          ...finalPositions,
          finalPositions[0],
        ]);
      }
      clearVertexMarkers();
      // The live readouts and construction lines go away with the rest of
      // the in-progress state. The finished measurement gets its labels back
      // from the sync effect, via `labelSource: 'measurement'` — one code
      // path for every label instead of a special case that survives the
      // handover.
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

    /**
     * Ends the current path the way leaving it should: keep it if it's a
     * real shape, drop it only if it isn't one yet.
     *
     * This is what switching tools does. Discarding instead — which is what
     * this used to do — meant a half-second of inattention could delete a
     * finished drawing, and the only thing that should ever remove work is
     * the discard button.
     */
    function commitInProgress() {
      const tool = inProgressToolRef.current;
      if (tool && isPathTool(tool) && positionsRef.current.length >= minimumVertices(tool)) {
        finishPath(tool);
      } else {
        // One stray vertex isn't a shape — and a two-point tool with only
        // its first point placed has nothing to measure yet.
        cancelInProgress();
      }
    }
    commitInProgressRef.current = commitInProgress;

    /** The second point of a two-point tool: wherever the cursor is, until it's clicked. */
    function liveEnd(): Cesium.Cartesian3 {
      return previewMousePosRef.current ?? positionsRef.current[0];
    }

    /** Adds a construction line that follows the cursor until the shape finishes. */
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
          // A preview that vanishes behind the building you're measuring
          // up to is no preview at all — see `hiddenLineMaterial`.
          depthFailMaterial: material,
        },
      });
      previewExtrasRef.current.push(entity);
    }

    /**
     * First click of a two-point tool: show what the second click will
     * produce, live, so the user aims the second point rather than guessing.
     */
    function startTwoPoint(tool: TwoPointTool) {
      inProgressToolRef.current = tool;
      const start = () => positionsRef.current[0];

      switch (tool) {
        case 'height':
          addPreviewLine(() => [start(), liveEnd()], casedLineMaterial(MEASURE_COLOR), 5);
          addPreviewLine(
            () => [start(), heightTriangleCorner(start(), liveEnd())],
            DASHED_MEASURE,
            1.5,
          );
          addPreviewLine(
            () => [heightTriangleCorner(start(), liveEnd()), liveEnd()],
            DASHED_MEASURE,
            1.5,
          );
          break;
        case 'line-of-sight':
          addPreviewLine(() => [raise(start(), EYE_HEIGHT), liveEnd()], DASHED_SIGHT, 2);
          break;
        case 'viewshed':
          addPreviewLine(
            () => rimPositions(start(), Cesium.Cartesian3.distance(start(), liveEnd())),
            new Cesium.ColorMaterialProperty(SIGHT_COLOR),
            2,
          );
          addPreviewLine(() => [start(), liveEnd()], DASHED_SIGHT, 1.5);
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

    /**
     * Second click of a two-point tool: swap the preview for the finished
     * feature. Height is pure geometry and is done here; line of sight and
     * viewshed need the terrain, so they start out as "Analysing" and
     * `runAnalysis` fills them in.
     */
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
          const eye = raise(start, EYE_HEIGHT);
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
        case 'viewshed': {
          entities = [
            tagPart(
              add({
                polyline: {
                  positions: rimPositions(start, Cesium.Cartesian3.distance(start, end)),
                  // Draped, so the rim follows the hills instead of cutting
                  // through them at the observer's height.
                  clampToGround: true,
                },
              }),
              'rim',
            ),
            tagPart(add({ position: raise(start, EYE_HEIGHT), point: { ...pointStyle } }), 'eye'),
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

    /**
     * Computes a line-of-sight or viewshed result and writes it into the
     * feature's entities and readout.
     *
     * Async, so the feature may have changed by the time it finishes: it
     * may have been deleted, or dragged again and re-analysed. Each run
     * takes a number, and only the latest run for a feature may apply.
     */
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
      let overlay: Cesium.Entity | null = null;
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
          const radius = Cesium.Cartesian3.distance(start, end);
          const result = await computeViewshed(cesiumViewer.terrainProvider, start, radius);
          if (!isCurrent()) return;
          overlay = tagPart(
            cesiumViewer.entities.add({
              rectangle: {
                coordinates: result.rectangle,
                material: new Cesium.ImageMaterialProperty({
                  image: result.image,
                  transparent: true,
                }),
              },
            }),
            'overlay',
          );
          measurement = describeViewshed(result.visibleFraction, radius);
        }
      } catch (error) {
        if (!isCurrent()) return;
        measurement = `Analysis failed: ${error instanceof Error ? error.message : String(error)}`;
      }

      // The feature may have been deleted while the analysis ran. Its
      // entities are already gone; don't leave a new overlay orphaned.
      const current = featuresRef.current.find((feature) => feature.id === featureId);
      if (!current) {
        if (overlay) cesiumViewer.entities.remove(overlay);
        return;
      }

      // A re-run replaces the previous overlay rather than stacking a
      // second image on top of it. Removed here, outside the state updater,
      // because StrictMode runs updaters twice and `remove` isn't idempotent
      // in effect — the second run would find nothing, but the first must
      // not be repeated against a list that already lacks the entity.
      const stale = overlay
        ? current.entities.filter((entity) => partOf(entity) === 'overlay')
        : [];
      for (const entity of stale) cesiumViewer.entities.remove(entity);
      const added = overlay;

      setFeatures((prev) =>
        prev.map((feature) =>
          feature.id === featureId
            ? {
                ...feature,
                measurement,
                entities: [
                  ...feature.entities.filter((entity) => !stale.includes(entity)),
                  ...(added ? [added] : []),
                ],
              }
            : feature,
        ),
      );
    }
    runAnalysisRef.current = runAnalysis;

    /**
     * Steps back one vertex, so a single misplaced click doesn't mean
     * restarting the whole shape. Undoing the last remaining vertex cancels
     * the path outright — that is what "one more step back" should mean.
     */
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

    // A translucent marker pinned to wherever the cursor meets the globe,
    // so you can see exactly where a click will land before committing to
    // it — the difference between aiming and guessing.
    //
    // Created once and shown/hidden through properties rather than added
    // and removed as tools change: mutating the entity collection makes
    // Cesium rebuild its render batches, while flipping a `show` callback
    // costs nothing. It is deliberately not a `DrawnFeature`, so "Clear
    // all" leaves it alone — it isn't a drawing.
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
        // Hidden when no tool is armed, and when the cursor isn't over the
        // globe at all — there is no location to preview in either case.
        show: new Cesium.CallbackProperty(
          () => activeToolRef.current !== 'none' && previewMousePosRef.current !== null,
          false,
        ),
      },
    });
    ghostEntityRef.current = ghost;

    /** The entity under a screen position, if anything of ours is there. */
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

    /** Keeps a dragged vertex's label following it, distance and all. */
    function refreshDragLabel(feature: DrawnFeature, positions: Cesium.Cartesian3[]) {
      const labelId = featureLabelIdsRef.current.get(feature.id);
      if (!labelId) return;
      const moved: DrawnFeature = {
        ...feature,
        positions,
        // Geometry readouts follow the drag; an analysis keeps its old
        // result until the drag ends and it's recomputed.
        measurement: measurementFor(feature.kind, positions) ?? feature.measurement,
      };
      const text = labelTextFor(moved);
      if (text !== null) labelLayer.update(labelId, labelAnchorFor(moved), text);
      // Its level line's label too. Appearing or disappearing as the drag
      // makes the path steeper or flatter waits for the sync effect when the
      // drag ends; mid-drag it just follows.
      const horizontalId = horizontalLabelIdsRef.current.get(feature.id);
      const horizontal = horizontalLabelFor(moved);
      if (horizontalId && horizontal) {
        labelLayer.update(horizontalId, horizontal.anchor, horizontal.text);
      }
    }

    const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const tool = activeToolRef.current;

      // With no tool armed, a click selects rather than draws. That split is
      // what lets one click mean two things without a modifier key: arming a
      // tool is the mode switch.
      if (tool === 'none') {
        const pickedEntity = pickEntity(event.position);
        // A click on a vertex handle begins a drag; it must not also change
        // the selection, or grabbing a handle would deselect the very shape
        // the handle belongs to.
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

      // Height, line of sight, viewshed: the first click sets the start,
      // the second finishes. No double-click needed — a third point would
      // mean nothing.
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

      // line / polygon / measure: accumulate vertices.
      const positions = positionsRef.current;

      // A second click in the same spot, soon enough after the last, means
      // "done" rather than "another vertex here" — see DOUBLE_CLICK_PIXELS
      // for why this isn't Cesium's LEFT_DOUBLE_CLICK. Catching it before
      // the vertex is added is what keeps the finished shape exactly the
      // points the user placed.
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
        // Cloned: Cesium reuses the event object between events.
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

    // Grabbing a vertex handle of the selected feature starts a drag.
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (activeToolRef.current !== 'none') return;
      const pickedEntity = pickEntity(event.position);
      if (!pickedEntity) return;
      const index = handleEntitiesRef.current.indexOf(pickedEntity);
      if (index === -1) return;
      const feature = featuresRef.current.find((entry) => entry.id === selectedIdRef.current);
      if (!feature) return;

      dragRef.current = { featureId: feature.id, index, positions: [...feature.positions] };
      // Left-drag normally spins the globe, which would drag the world out
      // from under the vertex instead of moving the vertex. `enableInputs`
      // rather than the individual `enableRotate`/`enableTranslate` flags:
      // it covers every camera gesture in one switch, including the ones
      // that differ between 2D, Columbus and 3D, so the drag can't be
      // hijacked by whichever mode the user happens to be in.
      cesiumViewer.scene.screenSpaceCameraController.enableInputs = false;
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction(() => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      cesiumViewer.scene.screenSpaceCameraController.enableInputs = true;
      // Cesium recorded the drag even though it was told not to act on it,
      // and would replay it as spin inertia the moment inputs come back —
      // letting go of a vertex would send the globe sliding.
      cancelCameraInertia(cesiumViewer.scene);

      // The drag moved the entities directly; this is where the change
      // reaches React state, once, rather than on every mouse move.
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
      // An analysis is only true for the points it was run from, so moving
      // one means running it again.
      if (dragged && isAnalysis) {
        void runAnalysisRef.current(dragged.id, dragged.kind, drag.positions, dragged.entities);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // Tracks the cursor for *every* armed tool, not only a path already in
    // progress: the marker previewing where a click will land needs a
    // position from the moment a tool is picked, before any vertex exists.
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      // A drag in progress owns the pointer, whatever else is going on.
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

      // Escape is the one deliberate "throw this away", so it works from
      // anywhere. The other two must never be taken from a panel the user
      // is typing in — Enter would submit the add-layer form and Backspace
      // would delete their text.
      //
      // With nothing in progress there's nothing to throw away, so Escape
      // puts the tool down instead. Without that, the only way out of a
      // tool was finding and clicking its button again — and pressing Esc
      // and still having the crosshair feels like being stuck in the tool.
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

      // A keyboard way to finish, for anyone whose double-click the map
      // keeps missing — and the only way to end a path without placing a
      // final vertex somewhere you didn't want one.
      if (event.key === 'Enter') {
        event.preventDefault();
        commitInProgress();
        return;
      }

      if (event.key === 'Backspace') {
        // Backspace navigates back in some browsers.
        event.preventDefault();
        undoLastVertex();
      }
    }
    window.addEventListener('keydown', onKeyDown);

    // Leaving the canvas — for a panel, or out of the window — means there
    // is no cursor position on the globe any more. Without this the preview
    // marker would hang frozen wherever the pointer crossed the edge.
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
      horizontalLabelIds.clear();
    };
    // `setActiveTool` is a stable callback; listing it doesn't re-run this.
  }, [viewer, setActiveTool]);

  // Switching tools ends whatever was mid-drawing — it can't stay live once
  // no active tool controls it. It is *committed*, not discarded: reaching
  // for another tool is not a request to delete the shape you just drew.
  // Only the discard button removes finished work.
  useEffect(() => {
    commitInProgressRef.current();
  }, [activeTool]);

  const selectedFeature = features.find((feature) => feature.id === selectedId) ?? null;

  // Selection and visibility are looks, not geometry, so they're pushed to
  // the entities here rather than being baked in when the shape is drawn.
  useEffect(() => {
    for (const feature of features) {
      styleFeature(feature, feature.id === selectedId);
    }
  }, [features, selectedId]);

  /**
   * Keeps the HTML label overlay in step with the feature list.
   *
   * One effect for create, update *and* remove: a label's existence is a
   * function of its feature's `labelSource`, so deriving the whole overlay
   * from the list each time is simpler — and harder to leak — than firing
   * add/remove calls from each of the half-dozen actions that can change it.
   */
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
          // Keyed off the kind, which never changes, rather than the label
          // source: a label is created once, and its style can't follow a
          // later switch between readout and name.
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

    // A measurement's second label, on its dotted level line. Derived the
    // same way: present exactly when `horizontalLabelFor` says so.
    const horizontalIds = horizontalLabelIdsRef.current;
    const wanted = new Set<string>();
    for (const feature of features) {
      const horizontal = horizontalLabelFor(feature);
      if (!horizontal) continue;
      wanted.add(feature.id);
      const existing = horizontalIds.get(feature.id);
      if (existing) labelLayer.update(existing, horizontal.anchor, horizontal.text);
      else
        horizontalIds.set(
          feature.id,
          labelLayer.add(horizontal.anchor, horizontal.text, 'readout'),
        );
    }
    for (const [featureId, labelId] of horizontalIds) {
      if (!wanted.has(featureId)) {
        labelLayer.remove(labelId);
        horizontalIds.delete(featureId);
      }
    }
  }, [features]);

  /**
   * Draggable handles on the selected feature's vertices.
   *
   * Rebuilt whenever the selected feature record changes — including for
   * edits that don't move anything, like renaming. That's a few entities
   * recreated for nothing, which is cheaper than the bookkeeping needed to
   * tell "the geometry changed" from "something else did".
   */
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

  /** Applies a change to one feature, leaving the rest of the list alone. */
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
      // Minted outside the updater: StrictMode runs updaters twice, and an
      // id created inside would differ between the two runs.
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
        // A label pointed at the attribute just deleted would show nothing
        // and give no clue why.
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
      viewer.flyTo(feature.entities).catch(() => {
        // A rejected flyTo (the feature was deleted mid-flight) isn't worth
        // surfacing to the user.
      });
    },
    [viewer],
  );

  // A crosshair is the conventional "you are about to place something"
  // cursor. The default grab-hand actively misleads while a tool is armed:
  // it promises that dragging pans the globe, which is the one thing a
  // click is no longer going to do.
  useEffect(() => {
    if (!viewer) return;
    const canvas = viewer.scene.canvas;
    // setProperty rather than assigning `style.cursor`: the canvas belongs
    // to the viewer passed in, and the React linter treats assigning into a
    // hook argument as mutating it.
    canvas.style.setProperty('cursor', activeTool === 'none' ? '' : 'crosshair');
    return () => {
      canvas.style.removeProperty('cursor');
    };
  }, [viewer, activeTool]);

  /**
   * The discard button: removes every drawing, in progress or finished.
   *
   * This is the *only* thing that deletes finished work — see the invariant
   * in CLAUDE.md. Selecting, switching tools and editing never do.
   */
  const clearAll = useCallback(() => {
    if (!viewer) return;
    cancelInProgressRef.current();
    for (const feature of featuresRef.current) {
      for (const entity of feature.entities) {
        viewer.entities.remove(entity);
      }
    }
    // Labels live in the DOM overlay rather than the entity collection, so
    // they need clearing separately; the sync effect would also do it, but
    // not until the next render.
    const labelLayer = labelLayerRef.current;
    for (const labels of [featureLabelIdsRef.current, horizontalLabelIdsRef.current]) {
      for (const labelId of labels.values()) labelLayer?.remove(labelId);
      labels.clear();
    }
    setFeatures([]);
    setSelectedId(null);
  }, [viewer]);

  /**
   * Finishes the path in progress — Enter, for a touch screen with no keyboard
   * and an unreliable double-tap. Keeps the shape if it has enough vertices
   * to be one, exactly as switching tools does.
   */
  const finishInProgress = useCallback(() => commitInProgressRef.current(), []);

  /** Removes the last vertex of the path in progress — Backspace, for touch. */
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
