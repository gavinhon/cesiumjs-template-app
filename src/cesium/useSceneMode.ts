import { useCallback, useEffect, useState } from 'react';
import * as Cesium from 'cesium';

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
      // Duration must be 0: any animated morph flies out to the whole globe.
      viewer.scene.morphTo3D(0);
    } else {
      viewer.scene.morphTo2D(0);
    }
  }, [viewer]);

  return { is2D, toggle };
}
