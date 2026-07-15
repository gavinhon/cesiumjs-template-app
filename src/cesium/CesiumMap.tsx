import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import {
  SINGAPORE_LATITUDE,
  SINGAPORE_LONGITUDE,
  SINGAPORE_VIEW_HEIGHT,
} from './singapore';

// We never call any Cesium ion API (createWorldImagery, createWorldTerrain,
// the ion-backed geocoder/base-layer-picker, ...), so this app doesn't need
// an ion access token at all. Clearing it is defensive: if some future code
// path *did* try to reach ion, it fails loudly instead of silently riding
// on Cesium's shared public demo token.
Cesium.Ion.defaultAccessToken = '';

interface CesiumMapProps {
  /** Called once the Viewer has been created, so parents can add layers to it. */
  onViewerReady: (viewer: Cesium.Viewer) => void;
}

/**
 * Mounts a full-screen, "blank" Cesium globe: no ion account, no built-in
 * toolbar widgets, camera pre-aimed at Singapore.
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
      // A plain OpenStreetMap raster layer as the base imagery. It talks
      // directly to OSM's public tile servers with no API key and no
      // Cesium ion account — swap this for your own WMS/WMTS/XYZ source
      // (see the sidebar) or a commercial basemap once you have one.
      baseLayer: new Cesium.ImageryLayer(
        new Cesium.OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        }),
      ),
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

    // Point the camera at Singapore, looking straight down from ~120km up.
    // `Cartesian3.fromDegrees(lon, lat, height)` converts a geographic
    // coordinate into the 3D Cartesian point Cesium's camera actually uses.
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        SINGAPORE_LONGITUDE,
        SINGAPORE_LATITUDE,
        SINGAPORE_VIEW_HEIGHT,
      ),
    });

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
