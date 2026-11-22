import * as Cesium from 'cesium';
import { INITIAL_VIEW } from '@/cesium/initialView';
import { pickSurface } from '@/cesium/pickSurface';

/** Short enough to feel like a button response, long enough to see where you went. */
const DURATION = 0.4;

/**
 * Turns the camera to `heading` (radians) about the point at the centre
 * of the screen, the way a map's compass button does.
 *
 * Cesium's own `setView` moves the *camera*: resetting heading spins it
 * on the spot, so the place you were looking at swings off-screen
 * whenever the view is tilted. Orbiting the centre point instead keeps
 * what's in the middle of the screen in the middle of the screen, which is
 * what every map's compass does and what people expect.
 *
 * Falls back to turning on the spot when there's no surface at the centre
 * (looking at the sky or into space), and in 2D, where there's no tilt to
 * swing the view away.
 */
export function orbitScreenCenter(viewer: Cesium.Viewer, heading: number): void {
  const { camera, scene } = viewer;
  const center = new Cesium.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2);
  const target = scene.mode === Cesium.SceneMode.SCENE3D ? pickSurface(viewer, center) : null;

  if (!target) {
    camera.setView({ orientation: { heading, pitch: camera.pitch, roll: 0 } });
    return;
  }

  const range = Cesium.Cartesian3.distance(camera.positionWC, target);
  camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 0), {
    offset: new Cesium.HeadingPitchRange(heading, camera.pitch, range),
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
