import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/theme';
import { createMapLabelLayer, type MapLabelLayer } from '@/cesium/mapLabels';
import { cancelCameraInertia } from '@/cesium/cancelCameraInertia';
import { createId } from '@/lib/ids';
import {
  applyGeometry,
  colorFor,
  labelAnchorFor,
  labelTextFor,
  styleFeature,
} from './featurePresentation';
import type { DrawnFeature, DrawnFeatureKind, FeatureAttribute, LabelSource } from './types';

/** Which drawing/measurement mode is currently active, if any. */
export type DrawingTool = 'none' | 'point' | 'line' | 'polygon' | 'measure' | 'label';

/** The tools that build a multi-vertex path, rather than placing one thing per click. */
export type PathTool = Extract<DrawingTool, 'line' | 'polygon' | 'measure'>;

export function isPathTool(tool: DrawingTool): tool is PathTool {
  return tool === 'line' || tool === 'polygon' || tool === 'measure';
}

// Cesium draws into WebGL, not the DOM, so it can't read the CSS custom
// properties in src/styles/tokens.css. The mirrored values live in
// src/cesium/theme.ts — don't reintroduce local copies here.
const DRAW_COLOR = MAP_COLORS.accent;
const MEASURE_COLOR = MAP_COLORS.measure;

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
  measure: 'Measurement',
  label: 'Label',
};

/** Fewest vertices that make a real shape — below this there's nothing to keep. */
function minimumVertices(tool: PathTool): number {
  return tool === 'polygon' ? 3 : 2;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(0)} m`;
}

/** Sum of the geodesic (great-circle) distance between consecutive points. */
function totalDistance(positions: Cesium.Cartesian3[]): number {
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const a = Cesium.Cartographic.fromCartesian(positions[i - 1]);
    const b = Cesium.Cartographic.fromCartesian(positions[i]);
    total += new Cesium.EllipsoidGeodesic(a, b).surfaceDistance;
  }
  return total;
}

/**
 * Lets the user draw points, lines, and polygons on the map, measure
 * point-to-point distance, and drop text labels — all via Cesium's
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
 * A finished shape becomes a `DrawnFeature` (see ./types.ts) — a record
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
  const labelLayerRef = useRef<MapLabelLayer | null>(null);
  // The in-progress measurement readout. Finished features get their labels
  // from the sync effect further down instead.
  const measureLabelIdRef = useRef<string | null>(null);

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
  featuresRef.current = features;
  selectedIdRef.current = selectedId;

  /** Label ids per feature, keyed by feature id — see the label sync effect. */
  const featureLabelIdsRef = useRef<Map<string, string>>(new Map());
  /** Draggable vertex handles for the selected feature, in vertex order. */
  const handleEntitiesRef = useRef<Cesium.Entity[]>([]);
  const dragRef = useRef<{
    featureId: string;
    index: number;
    positions: Cesium.Cartesian3[];
  } | null>(null);
  const cancelInProgressRef = useRef<() => void>(() => {});
  const commitInProgressRef = useRef<() => void>(() => {});
  // Which tool owns the path being drawn. Needed because committing happens
  // *after* `activeTool` has already changed to the tool being switched to.
  const pathToolRef = useRef<PathTool | null>(null);
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

    // The map has no real terrain (see CesiumMap.tsx), so picking against
    // the bare ellipsoid is the reliable way to turn a screen position into
    // a world position — and, unlike terrain/primitive picking, it works
    // the same way in both 2D and 3D. Returns null when the pointer isn't
    // over the globe at all (over space, or past the horizon).
    function pickGlobe(screenPosition: Cesium.Cartesian2): Cesium.Cartesian3 | null {
      return (
        cesiumViewer.camera.pickEllipsoid(screenPosition, cesiumViewer.scene.globe.ellipsoid) ??
        null
      );
    }

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
      if (measureLabelIdRef.current) {
        labelLayer.remove(measureLabelIdRef.current);
        measureLabelIdRef.current = null;
      }
      for (const ref of [previewEntityRef, outlineEntityRef]) {
        if (ref.current) {
          cesiumViewer.entities.remove(ref.current);
          ref.current = null;
        }
      }
      clearVertexMarkers();
      positionsRef.current = [];
      pathToolRef.current = null;
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
    }) {
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
      addFeature({ kind: 'point', positions: [position], entities: [entity] });
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

    // Keeps the running-total distance readout in sync with the current
    // vertices.
    //
    // This used to carry a long warning about never driving a Cesium
    // `Label` from a `CallbackProperty`: doing so re-rasterises the glyph
    // texture every frame and visibly corrupts the text. An HTML label has
    // no such trap — the browser handles text — so this is now just a
    // straightforward update, called from the same input events as before.
    function updateMeasureLabel(positions: Cesium.Cartesian3[]) {
      const id = measureLabelIdRef.current;
      if (!id || positions.length === 0) return;
      labelLayer.update(
        id,
        positions[positions.length - 1],
        formatDistance(totalDistance(positions)),
      );
    }

    // First click of a line/polygon/measurement: create the entity that
    // will track every vertex from here on. The polyline/polygon shape
    // uses a CallbackProperty (see updateMeasureLabel above for why the
    // label doesn't) so it redraws every frame without us manually pushing
    // updates to it on mouse move — we just keep the refs it reads from current.
    function startPath(tool: PathTool) {
      pathToolRef.current = tool;
      const color = tool === 'measure' ? MEASURE_COLOR : DRAW_COLOR;

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
        const outline = cesiumViewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(livePolygonOutline, false),
            width: 2,
            material: color,
          },
        });
        previewEntityRef.current = fill;
        outlineEntityRef.current = outline;
      } else {
        const line = cesiumViewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(livePositions, false),
            width: 3,
            material: color,
          },
        });
        previewEntityRef.current = line;
      }

      if (tool === 'measure') {
        measureLabelIdRef.current = labelLayer.add(
          positionsRef.current[0],
          formatDistance(0),
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
      // The live readout goes away with the rest of the in-progress state.
      // The finished measurement gets its label back from the sync effect,
      // via `labelSource: 'measurement'` — one code path for every label
      // instead of a special case that survives the handover.
      if (measureLabelIdRef.current) {
        labelLayer.remove(measureLabelIdRef.current);
        measureLabelIdRef.current = null;
      }

      const entities = [previewEntityRef.current, outlineEntityRef.current].filter(
        (entity): entity is Cesium.Entity => entity !== null,
      );
      addFeature({
        kind: tool,
        positions: finalPositions,
        entities,
        labelSource: tool === 'measure' ? 'measurement' : 'none',
        measurement: tool === 'measure' ? formatDistance(totalDistance(finalPositions)) : null,
      });

      previewEntityRef.current = null;
      outlineEntityRef.current = null;
      positionsRef.current = [];
      pathToolRef.current = null;
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
      const tool = pathToolRef.current;
      if (tool && positionsRef.current.length >= minimumVertices(tool)) {
        finishPath(tool);
      } else {
        // One stray vertex isn't a line or a polygon; there's nothing to keep.
        cancelInProgress();
      }
    }
    commitInProgressRef.current = commitInProgress;

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
      } else if (activeToolRef.current === 'measure') {
        updateMeasureLabel(livePositions());
      }
    }

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
        color: new Cesium.CallbackProperty(
          () => (activeToolRef.current === 'measure' ? GHOST_MEASURE_COLOR : GHOST_DRAW_COLOR),
          false,
        ),
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
        measurement:
          feature.kind === 'measure'
            ? formatDistance(totalDistance(positions))
            : feature.measurement,
      };
      const text = labelTextFor(moved);
      if (text !== null) labelLayer.update(labelId, labelAnchorFor(moved), text);
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

      const point = pickGlobe(event.position);
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
      addVertexMarker(point, tool === 'measure' ? MEASURE_COLOR : DRAW_COLOR);
      if (isFirstPoint) {
        startPath(tool);
      } else if (tool === 'measure') {
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
      setFeatures((prev) =>
        prev.map((feature) =>
          feature.id === drag.featureId
            ? {
                ...feature,
                positions: drag.positions,
                measurement:
                  feature.kind === 'measure'
                    ? formatDistance(totalDistance(drag.positions))
                    : feature.measurement,
              }
            : feature,
        ),
      );
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // Tracks the cursor for *every* armed tool, not only a path already in
    // progress: the marker previewing where a click will land needs a
    // position from the moment a tool is picked, before any vertex exists.
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      // A drag in progress owns the pointer, whatever else is going on.
      const drag = dragRef.current;
      if (drag) {
        const dragged = pickGlobe(event.endPosition);
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
      previewMousePosRef.current = pickGlobe(event.endPosition);
      if (tool === 'measure' && positionsRef.current.length > 0) {
        updateMeasureLabel(livePositions());
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    function onKeyDown(event: KeyboardEvent) {
      if (activeToolRef.current === 'none') return;

      // Escape is the one deliberate "throw this away", so it works from
      // anywhere. The other two must never be taken from a panel the user
      // is typing in — Enter would submit the add-layer form and Backspace
      // would delete their text.
      if (event.key === 'Escape') {
        cancelInProgress();
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
      featureLabelIdsRef.current.clear();
    };
  }, [viewer]);

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
          labelLayer.add(anchor, text, feature.kind === 'measure' ? 'readout' : 'text'),
        );
      }
    }

    for (const [featureId, labelId] of labelIds) {
      if (!live.has(featureId)) {
        labelLayer.remove(labelId);
        labelIds.delete(featureId);
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
    canvas.style.cursor = activeTool === 'none' ? '' : 'crosshair';
    return () => {
      canvas.style.cursor = '';
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
    for (const labelId of featureLabelIdsRef.current.values()) {
      labelLayer?.remove(labelId);
    }
    featureLabelIdsRef.current.clear();
    setFeatures([]);
    setSelectedId(null);
  }, [viewer]);

  return {
    activeTool,
    setActiveTool,
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
