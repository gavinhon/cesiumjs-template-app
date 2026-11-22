import * as Cesium from 'cesium';
import { INITIAL_VIEW } from '@/cesium/initialView';
import { pickSurface } from '@/cesium/pickSurface';

/** Short enough to feel like a button response, long enough to see where you went. */
const DURATION = 0.4;

/**
 * Turns and/or zooms the camera about the point at the centre of the
 * screen, the way a map's compass and zoom buttons do.
 *
 * Cesium's own `camera.zoomIn` and `setView` move the *camera*: zooming
 * slides it along its view direction, and resetting heading spins it on
 * the spot — so the place you were looking at swings off-screen whenever
 * the view is tilted. Orbiting the centre point instead keeps what's in
 * the middle of the screen in the middle of the screen, which is what
 * every map's buttons do and what people expect.
 *
 * Falls back to the camera-relative calls when there's no surface at the
 * centre (looking at the sky or into space), and in 2D, where Cesium's
 * camera is orthographic and `zoomIn`/`zoomOut` are the right calls.
 */
export function orbitScreenCenter(
  viewer: Cesium.Viewer,
  { heading, rangeScale = 1 }: { heading?: number; rangeScale?: number },
): void {
  const { camera, scene } = viewer;
  const center = new Cesium.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
  const target = scene.mode === Cesium.SceneMode.SCENE3D ? pickSurface(viewer, center) : null;

  if (!target) {
    const height = camera.positionCartographic.height;
    if (rangeScale < 1) camera.zoomIn(height * (1 - rangeScale));
    if (rangeScale > 1) camera.zoomOut(height * (rangeScale - 1));
    if (heading !== undefined) {
      camera.setView({ orientation: { heading, pitch: camera.pitch, roll: 0 } });
    }
    return;
  }

  const range = Cesium.Cartesian3.distance(camera.positionWC, target);
  camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 0), {
    offset: new Cesium.HeadingPitchRange(
      heading ?? camera.heading,
      camera.pitch,
      range * rangeScale,
    ),
    duration: DURATION,
  });
}

/** Back to the starting view, looking straight down with north up. */
export function flyHome(viewer: Cesium.Viewer): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      INITIAL_VIEW.longitude,
      INITIAL_VIEW.latitude,
      INITIAL_VIEW.height,
    ),
    orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    duration: 1,
  });
}
