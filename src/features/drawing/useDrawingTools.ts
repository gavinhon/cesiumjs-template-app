import { useCallback, useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';

/** Which drawing/measurement mode is currently active, if any. */
export type DrawingTool = 'none' | 'point' | 'line' | 'polygon' | 'measure' | 'label';

// Cesium draws into WebGL, not the DOM, so these can't read the CSS custom
// properties in src/styles/tokens.css — they're hand-mirrored copies. If
// you retheme the app, update both places.
const DRAW_COLOR = Cesium.Color.fromCssColorString('#4f9d5c'); // matches --accent
const MEASURE_COLOR = Cesium.Color.fromCssColorString('#d4a017'); // amber, so measurements read as distinct from drawn shapes
const LABEL_BACKGROUND = Cesium.Color.fromCssColorString('rgba(13, 16, 14, 0.85)'); // matches --surface

/**
 * Shared styling for every text label (the "Add label" tool and the
 * measure distance readout). A solid background instead of an outline:
 * Cesium renders label text via a signed-distance-field texture, and a
 * thick `outlineWidth` relative to a small font size makes that SDF stroke
 * come out as a blurry, blocky halo instead of a clean outline — at a
 * glance it just looks like broken/muddy rendering. A flat background box
 * sidesteps the SDF-outline artifact entirely and doubles as a legibility
 * aid over busy map imagery, which is why real map UIs (Google Maps
 * included) label this way rather than with outlined text.
 */
const LABEL_STYLE = {
  fillColor: Cesium.Color.WHITE,
  style: Cesium.LabelStyle.FILL,
  showBackground: true,
  backgroundColor: LABEL_BACKGROUND,
  backgroundPadding: new Cesium.Cartesian2(6, 4),
  verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
};

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
  const measureLabelRef = useRef<Cesium.Entity | null>(null);
  const allEntitiesRef = useRef<Set<Cesium.Entity>>(new Set());
  const cancelInProgressRef = useRef<() => void>(() => {});

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

    function cancelInProgress() {
      if (previewEntityRef.current) {
        cesiumViewer.entities.remove(previewEntityRef.current);
        allEntitiesRef.current.delete(previewEntityRef.current);
      }
      if (measureLabelRef.current) {
        cesiumViewer.entities.remove(measureLabelRef.current);
        allEntitiesRef.current.delete(measureLabelRef.current);
      }
      previewEntityRef.current = null;
      measureLabelRef.current = null;
      positionsRef.current = [];
      previewMousePosRef.current = null;
    }
    cancelInProgressRef.current = cancelInProgress;

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
      allEntitiesRef.current.add(entity);
    }

    function addLabel(position: Cesium.Cartesian3, text: string) {
      const entity = cesiumViewer.entities.add({
        position,
        point: {
          pixelSize: 6,
          color: DRAW_COLOR,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          ...LABEL_STYLE,
          text,
          font: '14px Roboto, sans-serif',
          pixelOffset: new Cesium.Cartesian2(0, -10),
        },
      });
      allEntitiesRef.current.add(entity);
    }

    // Keeps the running-total distance label in sync with the current
    // vertices. Deliberately *not* a CallbackProperty (contrast with the
    // polyline/polygon preview below): Cesium's Label re-rasterizes its
    // glyph texture from scratch — a canvas draw plus a GPU texture upload
    // — every time `label.text` actually changes, and a CallbackProperty
    // is re-evaluated on every rendered frame (~60/sec). A polyline's
    // CallbackProperty is cheap to re-evaluate that often (it just feeds a
    // vertex buffer); re-rasterizing text that often is not, and in
    // practice corrupts the glyph rendering (garbled/overlapping
    // characters) instead of just being slow. Calling this from actual
    // mouse-move/click events instead — a much lower, input-bound rate —
    // keeps every text change deliberate instead of continuous.
    function updateMeasureLabel(positions: Cesium.Cartesian3[]) {
      const label = measureLabelRef.current;
      if (!label?.label || positions.length === 0) return;
      label.position = new Cesium.ConstantPositionProperty(positions[positions.length - 1]);
      label.label.text = new Cesium.ConstantProperty(formatDistance(totalDistance(positions)));
    }

    // First click of a line/polygon/measurement: create the entity that
    // will track every vertex from here on. The polyline/polygon shape
    // uses a CallbackProperty (see updateMeasureLabel above for why the
    // label doesn't) so it redraws every frame without us manually pushing
    // updates to it on mouse move — we just keep the refs it reads from current.
    function startPath(tool: 'line' | 'polygon' | 'measure') {
      const color = tool === 'measure' ? MEASURE_COLOR : DRAW_COLOR;
      const entity =
        tool === 'polygon'
          ? cesiumViewer.entities.add({
              polygon: {
                hierarchy: new Cesium.CallbackProperty(
                  () => new Cesium.PolygonHierarchy(livePositions()),
                  false,
                ),
                material: color.withAlpha(0.3),
                outline: true,
                outlineColor: color,
              },
            })
          : cesiumViewer.entities.add({
              polyline: {
                positions: new Cesium.CallbackProperty(livePositions, false),
                width: 3,
                material: color,
              },
            });
      previewEntityRef.current = entity;
      allEntitiesRef.current.add(entity);

      if (tool === 'measure') {
        const label = cesiumViewer.entities.add({
          position: positionsRef.current[0],
          label: {
            ...LABEL_STYLE,
            text: formatDistance(0),
            font: '13px "IBM Plex Mono", monospace',
            pixelOffset: new Cesium.Cartesian2(0, -12),
          },
        });
        measureLabelRef.current = label;
        allEntitiesRef.current.add(label);
      }
    }

    function finishPath(tool: 'line' | 'polygon' | 'measure') {
      // A double-click is, physically, two single clicks — both of which
      // already added a vertex via the click handler below. Collapse that
      // pair into the one point the user meant to end on.
      positionsRef.current = positionsRef.current.slice(0, -1);

      const finalPositions = positionsRef.current;
      const minPoints = tool === 'polygon' ? 3 : 2;
      if (finalPositions.length < minPoints) {
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
      updateMeasureLabel(finalPositions);

      previewEntityRef.current = null;
      measureLabelRef.current = null;
      positionsRef.current = [];
      previewMousePosRef.current = null;
    }

    const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const tool = activeToolRef.current;
      if (tool === 'none') return;

      // The map has no real terrain (see CesiumMap.tsx), so picking against
      // the bare ellipsoid is the reliable way to turn a screen click into
      // a world position — and, unlike terrain/primitive picking, it works
      // the same way in both 2D and 3D.
      const point = cesiumViewer.camera.pickEllipsoid(
        event.position,
        cesiumViewer.scene.globe.ellipsoid,
      );
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
      const isFirstPoint = positionsRef.current.length === 0;
      positionsRef.current = [...positionsRef.current, point];
      if (isFirstPoint) {
        startPath(tool);
      } else if (tool === 'measure') {
        updateMeasureLabel(livePositions());
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      const tool = activeToolRef.current;
      const isPathTool = tool === 'line' || tool === 'polygon' || tool === 'measure';
      if (!isPathTool || positionsRef.current.length === 0) return;
      previewMousePosRef.current =
        cesiumViewer.camera.pickEllipsoid(event.endPosition, cesiumViewer.scene.globe.ellipsoid) ??
        null;
      if (tool === 'measure') updateMeasureLabel(livePositions());
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      const tool = activeToolRef.current;
      if (tool === 'line' || tool === 'polygon' || tool === 'measure') finishPath(tool);
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') cancelInProgress();
    }
    window.addEventListener('keydown', onKeyDown);

    return () => {
      handler.destroy();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [viewer]);

  // Switching tools abandons whatever shape was mid-drawing, rather than
  // leaving a rubber-band line on screen that no active tool controls
  // anymore.
  useEffect(() => {
    cancelInProgressRef.current();
  }, [activeTool]);

  const clearAll = useCallback(() => {
    if (!viewer) return;
    cancelInProgressRef.current();
    for (const entity of allEntitiesRef.current) {
      viewer.entities.remove(entity);
    }
    allEntitiesRef.current.clear();
  }, [viewer]);

  return { activeTool, setActiveTool, clearAll };
}
