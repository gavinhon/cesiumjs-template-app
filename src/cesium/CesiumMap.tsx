import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { DEFAULT_BASEMAP } from './basemaps';
import { installMapLight } from './hillshadeLight';
import { INITIAL_VIEW } from './initialView';

// We never call any Cesium ion API (createWorldImagery, createWorldTerrain,
// the ion-backed geocoder/base-layer-picker, ...), so this app doesn't need
// an ion access token at all. Clearing it is defensive: if some future code
// path *did* try to reach ion, it fails loudly instead of silently riding
// on Cesium's shared public demo token.
Cesium.Ion.defaultAccessToken = '';

// Every Viewer shows a "Cesium ion" logo in the bottom-left credits area by
// default, whether or not the app actually uses ion — this is the one
// documented hook for turning it off (`CreditDisplay.cesiumCredit` is a
// static property, so this must run before the Viewer is constructed).
// It only removes that logo; OSM's own attribution link — required by their
// usage policy — is a separate credit and is untouched.
// Cesium's own .d.ts types this as non-nullable `Credit`, but the runtime
// setter handles `undefined` fine (it just means "no logo to show").
// @ts-expect-error -- see comment above; this is a typings gap, not a bug.
Cesium.CreditDisplay.cesiumCredit = undefined;

interface CesiumMapProps {
  /** Called once the Viewer has been created, so parents can add layers to it. */
  onViewerReady: (viewer: Cesium.Viewer) => void;
}

/**
 * Mounts a full-screen, "blank" Cesium globe: no ion account, no built-in
 * toolbar widgets, camera pre-aimed at `INITIAL_VIEW`.
 *
 * Cesium's `Viewer` is a *class*, not a React component — it imperatively
 * takes over a DOM element and drives its own WebGL render loop. That's a
 * fundamentally different lifecycle model than React's declarative
 * rendering, so we bridge the two with the standard React pattern for
 * wrapping imperative libraries: create the instance once inside a
 * `useEffect` (targeting a `<div>` obtained via `useRef`), and destroy it
 * in the effect's cleanup function.
 */
export function CesiumMap({ onViewerReady }: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  useEffect(() => {
    // Guard against React 18/19 StrictMode's dev-only double-invoke of
    // effects, which would otherwise try to create two Viewers on the same
    // DOM node.
    if (!containerRef.current || viewerRef.current) {
      return;
    }

    const viewer = new Cesium.Viewer(containerRef.current, {
      // The starting basemap — Esri World Imagery, with no API key and no
      // Cesium ion account. The layer manager switches between the
      // basemaps in ./basemaps.ts; add your own there.
      baseLayer: DEFAULT_BASEMAP.createLayer(),
      // No `terrainProvider`/`terrain` option here: Cesium's default is a
      // smooth WGS84 ellipsoid (no elevation data), which — like the
      // imagery above — needs no ion access. Swap in `Cesium.Terrain.fromWorldTerrain()`
      // (requires an ion token) or your own terrain tile service later.

      // --- Strip every built-in widget for a blank canvas --------------
      // Viewer normally composites a whole desktop-GIS-style UI (play/pause
      // controls, a base-layer picker, a search box, ...) on top of the
      // globe. Setting each of these to `false` removes that chrome so the
      // map itself is the entire UI; the sidebar built alongside this
      // component is the app's only "widget".
      animation: false, // bottom-left clock/playback dial
      baseLayerPicker: false, // top-right imagery/terrain picker (ion-backed)
      fullscreenButton: false,
      vrButton: false,
      geocoder: false, // top-right search box (ion-backed)
      homeButton: false,
      infoBox: false, // popup shown when an entity is clicked
      sceneModePicker: false, // 2D / 3D / Columbus View toggle
      selectionIndicator: false,
      timeline: false, // bottom time scrubber
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      projectionPicker: false,
      shouldAnimate: false, // no clock ticking; we show no time-dynamic data
    });

    // Cesium's Viewer binds double-click to "track the entity under the
    // cursor", panning the camera to it and locking on. That's dead weight
    // here — there is no infoBox, no selection indicator, and nothing in
    // this app tracks entities — and it actively fights the drawing tools,
    // which finish a line or polygon on double-click *and* put a vertex
    // marker exactly where that double-click lands. Left in, finishing a
    // shape locks the camera onto that marker and dives it to ground level.
    viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // Point the camera at the starting view, looking straight down.
    // `Cartesian3.fromDegrees(lon, lat, height)` converts a geographic
    // coordinate into the 3D Cartesian point Cesium's camera actually uses.
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        INITIAL_VIEW.longitude,
        INITIAL_VIEW.latitude,
        INITIAL_VIEW.height,
      ),
    });

    // A fixed light instead of the real-time sun, so 3D models aren't
    // black whenever it's night where they are. See installMapLight.
    installMapLight(viewer.scene);

    viewerRef.current = viewer;
    onViewerReady(viewer);

    // Effect cleanup: tear down the Viewer (WebGL context, render loop,
    // DOM nodes) when this component unmounts.
    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
    // `onViewerReady` is React's `setViewer` state setter passed down from
    // <App>, which React guarantees is referentially stable across
    // re-renders — so including it here doesn't cause this effect (which
    // must run only once, to create exactly one Viewer) to re-run.
  }, [onViewerReady]);

  // absolute + inset:0 makes this div fill its nearest positioned ancestor
  // (the app root), which — combined with the full-viewport reset in
  // index.css — makes the globe cover the entire screen.
  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
