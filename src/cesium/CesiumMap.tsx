import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { DEFAULT_BASEMAP } from './basemaps';
import { installMapLight } from './hillshadeLight';
import { INITIAL_VIEW } from './initialView';

Cesium.Ion.defaultAccessToken = '';

// @ts-expect-error -- cesiumCredit is untyped but settable; hides the ion logo (no ion here).
Cesium.CreditDisplay.cesiumCredit = undefined;

interface CesiumMapProps {
  onViewerReady: (viewer: Cesium.Viewer) => void;
}

export function CesiumMap({ onViewerReady }: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  useEffect(() => {
    // One Viewer only: StrictMode runs effects twice.
    if (!containerRef.current || viewerRef.current) {
      return;
    }

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: DEFAULT_BASEMAP.createLayer(),

      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      vrButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      projectionPicker: false,
      shouldAnimate: false,
    });

    // Default double-click dives the camera onto an entity; drawing tools finish shapes with double-click.
    viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        INITIAL_VIEW.longitude,
        INITIAL_VIEW.latitude,
        INITIAL_VIEW.height,
      ),
    });

    // Off by default, models show through hills; markers opt out with disableDepthTestDistance.
    viewer.scene.globe.depthTestAgainstTerrain = true;

    installMapLight(viewer.scene);

    viewerRef.current = viewer;
    onViewerReady(viewer);

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [onViewerReady]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
