import * as Cesium from 'cesium';
import { INITIAL_VIEW } from '@/cesium/initialView';
import { pickSurface } from '@/cesium/pickSurface';

const DURATION = 0.4;

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
