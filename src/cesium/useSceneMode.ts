import { useCallback, useEffect, useState } from 'react';
import * as Cesium from 'cesium';

/**
 * Tracks and toggles the globe between 2D and 3D, staying over whatever
 * area is currently in view (e.g. Singapore) instead of resetting to a
 * whole-globe view.
 *
 * That's not the default: `morphTo2D`/`morphTo3D` take a duration, and
 * with any duration greater than 0, Cesium plays a fixed cinematic
 * animation that pulls the camera *all the way back to a whole-globe
 * view* before flattening/curving it — by design, not a bug (confirmed by
 * reading Cesium's own `SceneTransitioner` source: `duration > 0` hard-codes
 * the morph's start/end camera to `(0, 0, 5 × Earth's radius)`). Only
 * `duration === 0` takes the other code path, which computes the 2D/3D
 * camera that actually corresponds to the current view. So we pass 0,
 * trading the animation for keeping the same place on screen.
 *
 * `scene.morphComplete` is how we find out a mode change finished (and
 * with it, whatever the user did in the meantime — e.g. a manual scene
 * mode change elsewhere — settled) so `is2D` stays accurate.
 */
export function useSceneMode(viewer: Cesium.Viewer | null) {
  const [is2D, setIs2D] = useState(false);

  useEffect(() => {
    if (!viewer) return;

    function syncMode() {
      setIs2D(viewer!.scene.mode === Cesium.SceneMode.SCENE2D);
    }
    syncMode();

    viewer.scene.morphComplete.addEventListener(syncMode);
    return () => {
      viewer.scene.morphComplete.removeEventListener(syncMode);
    };
  }, [viewer]);

  const toggle = useCallback(() => {
    if (!viewer) return;
    if (viewer.scene.mode === Cesium.SceneMode.SCENE2D) {
      viewer.scene.morphTo3D(0);
    } else {
      viewer.scene.morphTo2D(0);
    }
  }, [viewer]);

  return { is2D, toggle };
}
