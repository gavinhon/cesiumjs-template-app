import * as Cesium from 'cesium';

const depthScratch = new Cesium.Cartesian3();

export function pickSurface(
  viewer: Cesium.Viewer,
  windowPosition: Cesium.Cartesian2,
): Cesium.Cartesian3 | null {
  const { scene, camera } = viewer;
  const ray = camera.getPickRay(windowPosition);
  const onGround = (ray && scene.globe.pick(ray, scene)) ?? undefined;

  if (scene.mode === Cesium.SceneMode.SCENE3D && scene.pickPositionSupported) {
    const inDepth = scene.pickPosition(windowPosition, depthScratch);
    if (inDepth) {
      if (!onGround) return Cesium.Cartesian3.clone(inDepth);
      const toGround = Cesium.Cartesian3.distance(camera.positionWC, onGround);
      const toDepth = Cesium.Cartesian3.distance(camera.positionWC, inDepth);
      const margin = Math.max(2, toGround * 0.01);
      const buriedTooDeep = toDepth - toGround > Math.max(1000, toGround * 0.05);
      if (Math.abs(toDepth - toGround) > margin && !buriedTooDeep) {
        return Cesium.Cartesian3.clone(inDepth);
      }
    }
  }

  return onGround ?? camera.pickEllipsoid(windowPosition, scene.globe.ellipsoid) ?? null;
}
